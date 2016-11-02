var ffmpeg = require('fluent-ffmpeg');
const exec = require('child_process').exec
var stream = require('stream');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var Q = require('bluebird');
var UUID = require('uuid');
const fsWriteFile = Q.promisify(require("fs").writeFile);


/*

Out folder
  - save clip
  -



*/

//video fps for base64
const IMAGE_FPS = 30

const pad = (str, max) => {
  str = str.toString();
  return str.length < max ? pad("0" + str, max) : str;
}

const _decodeBase64Image = (dataString) => {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)

  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }

  return new Buffer(matches[2], 'base64');;
}

class Mp4Record {
  constructor(options = {}) {
    this._videoBuffers = []
    this._audioBuffers = []
    this._frameCounter = 0
    if (options.ffmpegPath) {
      //ffmpeg.setFfmpegPath(options.ffmpegPath)
    }
  }

  set saveDirectory(dir) {
    this._saveDir = dir
  }

  get saveDirectory() {
    return this._saveDir || __dirname
  }

  addAudio(buffer) {
    this._audioBuffers.push(buffer)
  }

  addFrame(buffer) {
    this._videoBuffers.push(buffer)
  }

  saveImage(base64Str, options) {
    let {
      saveDir
    } = options
    this._frameCounter++
      let _name = pad(this._frameCounter, 12)
    var p = this._getImageSavePath(saveDir, _name)
    return this._writeFile(p, base64Str)
  }

  save(options) {
    let {
      width,
      height,
      saveDir,
      inputOptions,
      outputOptions,
      withBuffers
    } = options
    return new Q((yes, no) => {
      let _uuid = UUID.v4()
      let _audioStream = new stream.Readable()
      let _videoStream
      while (this._audioBuffers.length) {
        _audioStream.push(this._audioBuffers.shift(),'binary')
      }
      _audioStream.push(null)

      if (withBuffers) {
        _videoStream = new stream.Readable()
        while (this._videoBuffers.length) {
          _videoStream.push(this._videoBuffers.shift(), 'binary')
        }
        _videoStream.push(null)
      }

      let _a = path.join(saveDir, `${_uuid}_audio.m4a`)
      let _v = path.join(saveDir, `${_uuid}_video.mp4`)
      let _p = path.join(saveDir, `${_uuid}.mp4`)

      ffmpeg(_audioStream)
        .outputOptions([
          '-c:a libfaac',
          '-vn'
        ])
        .output(_a)
        .on('start', (commandLine) => {
          console.log('Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('stderr', (stderrLine) => {
          console.log(stderrLine);
        })
        .on('error', (err, stdout, stderr) => {
          console.log('Cannot process video: ' + err.message);
          console.log(stdout);
          console.log(stderr);
          no(err)
        })
        .on('end', () => {
          console.log("Finished audio encode");
          this._audioBuffers.length = 0

          if (withBuffers) {
            this._encodeVideoWithBuffers(_videoStream, options, _v, (videoPath) => {
              this._videoBuffers.length = 0
              this._mergeAudioVideo(_p, _a, _v)
                .then(() => {
                  console.log(`Success ${_p}`);
                  yes(_p)
                })
            })
          } else {
            this._writeFiles(saveDir, _uuid, this._videoBuffers)
              .then(() => {
                this._encodeFromBase64(saveDir, _v)
                  .then(() => {
                    this._mergeAudioVideo(_p, _a, _v)
                      .then(() => {
                        console.log(`Success ${_p}`);
                        yes(_p)
                      })
                  })
              })
          }
        })
        .run();
    })
  }

  _encodeVideoWithBuffers(stream, options, outputPath, cb) {
    let {
      width,
      height
    } = options

    ffmpeg(stream)
      .inputFormat('rawvideo')
      .inputOptions([
        '-framerate 30', //should be 30... but 15 works
        `-s ${width}x${height}`,
        '-c:v rawvideo',
        '-pix_fmt', 'rgba',
      ])
      .size(`${width}x${height}`)
      .format('mp4')
      .outputOptions([
        '-c:v libx264',
        '-framerate 30',
        '-an'
      ])
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log('Spawned Ffmpeg with command: ' + commandLine);
      })
      .on('stderr', (stderrLine) => {})
      .on('error', (err, stdout, stderr) => {
        console.log('Cannot process video: ' + err.message);
        console.log(stdout);
        console.log(stderr);
        no(err)
      })
      .on('end', () => {
        cb(outputPath)
      })
      .run()
  }

  _getImageSavePath(dir, name, uuid) {
    let _n = uuid ? `${name}${uuid}` : name
    return path.join(dir, `${_n}.png`)
  }

  _writeFile(p, base64Str) {
    return fsWriteFile(p, _decodeBase64Image(base64Str))
  }

  _writeFiles(dir, uuid, frames) {
    return Q.map(frames, (frame, i) => {
        //we might add frames before
        let _index = this._frameCounter + i
        let _name = pad(_index, 12)
        var p = this._getImageSavePath(dir, _name, uuid)
        return this._writeFile(p, frame)
      }, { concurrency: 1 })
      .then(() => {
        frames.length = 0
      })
  }

  _encodeFromBase64(dir, output, encodeOptions) {

    let _p = `"${path.join(dir,"*.png")}"`
    let _c = `ffmpeg -framerate ${IMAGE_FPS} -pattern_type glob -i ${_p} -y -c:v libx264 -framerate ${IMAGE_FPS} -an ${output}`
    return new Q((yes, no) => {
      let _cmd = exec(_c, (code, stdout, stderr) => {
        /*
        The output is in stderr for some reason
        */
        yes(output)
      });
    })
  }

  _mergeAudioVideo(output, audioPath, videoPath) {
    return new Q((yes, no) => {
      ffmpeg(audioPath)
        .input(videoPath)
        .outputOptions([
          '-shortest',
          '-c:v copy',
          '-c:a copy',
        ])
        .output(output)
        .on('start', (commandLine) => {
          console.log('Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('stderr', (stderrLine) => {})
        .on('error', (err, stdout, stderr) => {
          console.log('Cannot process video: ' + err.message);
          console.log(stdout);
          console.log(stderr);
          no(err)
        })
        .on('end', () => {
          yes(output)
        })
        .run();
    })

  }

  destroy() {
    if (this._videoBuffers) {
      this._videoBuffers.length = 0
      this._videoBuffers = null
    }
    if (this._audioBuffers) {
      this._audioBuffers.length = 0
      this._audioBuffers = null
    }
  }
}

module.exports = Mp4Record

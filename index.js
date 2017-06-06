var ffmpeg = require('fluent-ffmpeg');
const exec = require('child_process').exec
var stream = require('stream');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var Q = require('bluebird');
var toBuffer = require('typedarray-to-buffer');
var UUID = require('uuid');
const fsWriteFile = Q.promisify(require("fs").writeFile);


/*

Out folder
  - save clip
  -



*/

//video fps for base64
const IMAGE_FPS = 30
const IMAGE_EXT = '.jpg'

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
      if(fs.existsSync(options.ffmpegPath)){
        ffmpeg.setFfmpegPath(options.ffmpegPath)
      }
    }
  }

  set imageExt(ext) {
    this._imageExt = ext
  }

  get imageExt() {
    return this._imageExt || IMAGE_EXT
  }

  set saveDirectory(dir) {
    this._saveDir = dir
  }

  get saveDirectory() {
    return this._saveDir || __dirname
  }

  addAudio(buffer) {
    this._audioBuffers.push(buffer)
    console.log(this._audioBuffers.length);
  }

  addFrame(buffer) {
    this._videoBuffers.push(buffer)
  }

  saveImage(base64Str, options = {}) {
    let {
      saveDir
    } = options
    saveDir = saveDir || this.saveDirectory
    this._frameCounter++;
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
      clean,
      withBuffers
    } = options

    saveDir = saveDir || this.saveDirectory
    console.log(options);
    console.log(saveDir);
    return new Q((yes, no) => {
      let _uuid = UUID.v4()
      let _audioStream = new stream.Readable()
      let _videoStream
      while (this._audioBuffers.length) {
        let c = this._audioBuffers.shift()
        if (typeof c === 'object') {
          c = toBuffer(c)
        }
        _audioStream.push(toBuffer(c), 'binary')
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
      let _atmp = path.join(saveDir, `${_uuid}_audio_tmp.m4a`)
      let _v = path.join(saveDir, `${_uuid}_video.mp4`)
      let _p = path.join(saveDir, `${_uuid}.mp4`)

      ffmpeg(_audioStream)
        .outputOptions([
          '-c:a libfaac',
          '-vn'
        ])
        .output(_atmp)
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

          if (inputOptions || outputOptions) {
            this._trimAudio(_atmp, _a, inputOptions, outputOptions)
              .then(() => {
                fs.unlinkSync(_atmp)
                if (withBuffers) {
                  this._onAudioEncodeCompleteSaveBuffer(_videoStream, options, _v, _a, _p, yes, no)
                } else {
                  this._onAudioEncodeCompleteWriteFile(saveDir, _uuid, _a, _v, _p, this._videoBuffers, yes, no)
                }
              })
          } else {
            //rename to correct
            fs.renameSync(_atmp, _a)
            if (withBuffers) {
              this._onAudioEncodeCompleteSaveBuffer(_videoStream, options, _v, _a, _p, yes, no)
            } else {
              this._onAudioEncodeCompleteWriteFile(saveDir, _uuid, _a, _v, _p, this._videoBuffers, yes, no)
            }
          }
        })
        .run();
    })
  }

  _onAudioEncodeCompleteSaveBuffer(videoStream, options, videoPath, audioPath, finalPath, yes, no) {
    return this._encodeVideoWithBuffers(videoStream, options, videoPath)
      .then(videoPath => {
        this._videoBuffers.length = 0
        return this._mergeAudioVideo(finalPath, audioPath, videoPath, options)
          .then(() => {
            console.log(`Success ${finalPath}`);
            yes(finalPath)
          })
      })
      .catch(err => {
        no(err)
      })
  }

  _onAudioEncodeCompleteWriteFile(saveDir, uuid, audioPath, videoPath, finalPath, videoBuffers, yes, no) {
    return this._writeFiles(saveDir, uuid, videoBuffers)
      .then(() => {
        return this._encodeFromBase64(saveDir, videoPath)
          .then(() => {
            return this._mergeAudioVideo(finalPath, audioPath, videoPath)
              .then(() => {
                yes(finalPath)
              })
          })
      })
      .catch(err => {
        no(err)
      })
  }

  _encodeVideoWithBuffers(stream, options, outputPath) {
    let {
      width,
      height
    } = options
    return new Q((yes, no) => {
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
          yes(outputPath)
        })
        .run()
    })
  }

  _getImageSavePath(dir, name, uuid) {
    let _n = uuid ? `${name}${uuid}` : name
    return path.join(dir, `${_n}${this.imageExt}`)
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

      let _p = `"${path.join(dir,`*${this.imageExt}`)}"`
    let _c = `ffmpeg -framerate ${IMAGE_FPS} -pattern_type glob -i ${_p} -y -c:v libx264 -framerate ${IMAGE_FPS} -an ${output}`
    console.log(_c);
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

  _trimAudio(input, output, inputOptions = [], outputOptions = []) {
    let _c = `ffmpeg ${inputOptions.toString()}  -i ${input} -y  -vn -c:a copy ${outputOptions.toString()} ${output}`
    console.log(_c);
    return new Q((yes, no) => {
      let _cmd = exec(_c, (code, stdout, stderr) => {
        /*
        The output is in stderr for some reason
        */
        yes(output)
      });
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

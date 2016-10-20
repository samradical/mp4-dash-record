var toBuffer = require('typedarray-to-buffer')
var ffmpeg = require('fluent-ffmpeg');
var stream = require('stream');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var Q = require('bluebird');
var uuid = require('uuid');
var spy = require("through2-spy")

/*

Out folder
  - save clip
  -



*/

const OUT_W = 640
const OUT_H = 480

const S = (() => {

  let _currentBuffer = new Uint8Array(0);
  let _currentGroupOutfiles = {}


  function add(outDir = __dirname, options) {
    var indexBuffer = options.indexBuffer
    var rangeBuffer = options.rangeBuffer
    var saveName = options.saveName || `${uuid.v4()}`
    var duration = options.duration || 5
    var saveGroup = options.saveGroup
    var outWidth = options.width || OUT_W
    var outHeight = options.height || OUT_H
    if (!indexBuffer || !rangeBuffer || !duration) {
      throw new Error('Missing options')
      return
    }

    var segment = new Uint8Array(indexBuffer.byteLength + rangeBuffer.byteLength);
    segment.set(new Uint8Array(indexBuffer), 0);
    segment.set(new Uint8Array(rangeBuffer), indexBuffer.byteLength);
    let _b = toBuffer(segment)
    var s = new stream.Readable();
    s.push(_b);
    s.push(null);

    let _outName = `${saveName}.mp4`
    let _out = path.join(outDir, _outName)

    let _obj = {
      name: _outName,
      path: _out,
      duration: duration,
      resolution: `${outWidth}x${outHeight}`,
      busy: true
    }

    _currentGroupOutfiles[saveName] = _obj

    if (saveGroup) {
      return _saveRange(s, _obj).then(() => {
        return _saveGroup(outDir).then(path => {
          console.log(path);
          return path
        })
      })
    } else {
      return _saveRange(s, _obj)
    }
  }

  var frameStream

  function addFrame(outDir, arrayBuffer, end = false) {
    let _start = !!frameStream
    if (!_start) {
      frameStream = new stream.Readable();
    }
    var frame = new Uint8Array(arrayBuffer.length);
    frame.set(new Uint8Array(arrayBuffer), 0);
    let _b = toBuffer(frame)
    frameStream.push(_b);
    console.log(_start, "Got", end);
    if (end) {
      frameStream.push(null);
      setTimeout(() => {
        let _outName = `${uuid.v4()}.mp4`
        let _out = path.join(outDir, _outName)
        console.log(_out);
        var command = ffmpeg(frameStream)
          .inputFormat('rawvideo')
          .inputOptions([
            '-r 30',
            '-s 640x360',
            '-c:v rawvideo',
            '-pix_fmt', 'rgba',
          ])
          .size('640x360')
          .format('mp4')
          .outputOptions([
            '-c:v libx264',
            '-r 30',
            '-an',
          ])
          .output(_out)
          .on('start', (commandLine) => {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
          })
          .on('stderr', (stderrLine) => {
            //console.log('Stderr output: ' + stderrLine);
          })
          .on('error', (err, stdout, stderr) => {
            console.log('Cannot process video: ' + err.message);
            console.log(stdout);
            console.log(stderr);
          })
          .on('end', () => {
            console.log("Success");
          })
          .run();
      }, 400)
    }
    if (!_start) {}

  }

  function saveBuffer(outDir = __dirname, buffer, options={}) {
    console.log(buffer.length);
    var saveName = options.saveName || `${uuid.v4()}`
    var duration = options.duration
    var outWidth = options.width || OUT_W
    var outHeight = options.height || OUT_H
    var s = new stream.Readable();
    s.push(buffer);
    s.push(null);

    let _outName = `${saveName}.mp4`
    let _out = path.join(outDir, _outName)

    let _obj = {
      name: _outName,
      path: _out,
      duration: duration,
      //resolution: `${outWidth}x${outHeight}`,
      busy: true
    }

    console.log(_obj);

    _currentGroupOutfiles[saveName] = _obj

    return _saveRange(s, _obj)
  }


  function _saveGroup(outDir, outName) {
    return new Q((yes, no) => {
      outName = outName || `concat${uuid.v4()}.mp4`

      let _concatFile = ''
      _.forIn(_currentGroupOutfiles, (val, key) => {
        if (!val.busy) {
          _concatFile += `file '${val.name}' \n`
        }
      })
      if (_concatFile.length) {
        let _concatPath = path.join(outDir, `${uuid.v4()}.txt`)
        let _outvideoFile = path.join(outDir, outName)

        fs.writeFileSync(_concatPath, _concatFile, 'utf-8')
        fs.chmodSync(_concatPath, '0777')
        ffmpeg(_concatPath)
          .inputOptions([
            '-f concat'
          ])
          .outputOptions(['-c:video copy'])
          .output(_outvideoFile)
          .on('start', (commandLine) => {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
          })
          .on('error', (err, stdout, stderr) => {
            console.log('Cannot process video: ' + err.message);
            console.log(stdout);
            console.log(stderr);
            no(err)
          })
          .on('end', () => {
            console.log('Finished concatinating');
            console.log(_outvideoFile);
            console.log(yes);
            yes(_outvideoFile)
            console.log("____________");
          })
          .run();
        _currentGroupOutfiles = {}
      }
    })
  }

  function _saveRange(stream, obj) {

    //var cmd = 'ffmpeg -analyzeduration 500000000 -threads 4 ' + silentAudio + ' -i ' + input + ' -filter:a "volumedetect,asyncts=compensate=1:min_delta=0" -ss ' + start + ' -t ' + dur + ' -copyts -start_at_zero -force_key_frames ' + 0 + ',' + dur + ' -bsf:v h264_mp4toannexb -f mpegts -y -codec:a libfdk_aac -b:a 152k -map ' + mapAudioSource + ':a -map ' + mapVideoSource + ':v ' + constants.mp4Args + output;
    return new Q((yes, no) => {
      var command = ffmpeg(stream)
        .output(obj.path)
        //.size(obj.resolution)
        .outputOptions([
          '-copyts',
          '-start_at_zero',
          `-force_key_frames:v 0:4`,
          '-bsf:v h264_mp4toannexb',
          '-f mpegts',
          '-c:v libx264',
          `-t ${obj.duration}`
        ])
        .on('start', (commandLine) => {
          console.log('Spawned Ffmpeg with command: ' + commandLine);
        })
        .on('stderr', (stderrLine) => {
          //console.log('Stderr output: ' + stderrLine);
        })
        .on('error', (err, stdout, stderr) => {
          console.log('Cannot process video: ' + err.message);
          console.log(stdout);
          console.log(stderr);
          no(err)
        })
        .on('end', () => {
          obj.busy = false
          console.log('Finished processing');
          yes(obj.path)
        })
        .run();
    })
  }

  /*function _saveRange(stream, obj) {
      return new Promise((yes, no) => {
          var command = ffmpeg(stream)
              .output(obj.path)
              .toFormat('mp4')
              .size('640x480')
              .videoCodec('libx264')
              .outputOptions('-an -t 4')
              .on('start', (commandLine) => {
                  console.log('Spawned Ffmpeg with command: ' + commandLine);
              })
              .on('stderr', (stderrLine) => {
                  //console.log('Stderr output: ' + stderrLine);
              })
              .on('error', (err, stdout, stderr) => {
                  console.log('Cannot process video: ' + err.message);
                  console.log(stdout);
                  console.log(stderr);
                  no(err)
              })
              .on('end', () => {
                  obj.busy = false
                  console.log('Finished processing');
                  yes(obj)
              })
              .run();
      })
  }*/

  return {
    add: add,
    saveBuffer: saveBuffer,
    //addFromBuffer: addFromBuffer,
    addFrame: addFrame,
    save: _saveGroup
  }
})()

module.exports = S
  /*

  TAKE THE PREVIOUS AND CONCAT


          s.push(null);

          var tmp = new Uint8Array(segment.byteLength + _currentBuffer.byteLength);
          console.log(_currentBuffer.byteLength);
          if (_currentBuffer.byteLength > 0) {
              tmp.set(_currentBuffer, 0);
          }
          tmp.set(segment, _currentBuffer.byteLength);

          _currentBuffer = tmp

          if (typeof saveName === 'string') {
              save(saveName)
          }
  */
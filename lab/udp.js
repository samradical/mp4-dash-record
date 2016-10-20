
  var frameBufferStreamRead,
    frameBufferStreamWrite,
    frameBufferStream, count = 0,
    paused = false

  function addBuffer(output, buffer) {

    let _start = !!frameBufferStream
      /*let _temp = new stream.Writable();
      _temp.push(buffer, 'binary')
      _temp.push(null)*/
      let _temp = new stream.Writable();
      _temp.end(buffer, 'binary')

    if (!_start) {
      frameBufferStreamRead = new stream.Readable();
      frameBufferStreamWrite = new stream.Writable();
      /*frameBufferStreamRead.on('drain', () => {
        paused = false
        console.log("DRAINED");
      })*/
      /*frameBufferStream = spy(function(chunk) {
        count++
      })*/
      //let _wrote = frameBufferStreamWrite.write(buffer, 'binary')
      //frameBufferStreamWrite.end(buffer, 'binary')
      //console.log(_wrote);
      _temp.pipe(frameBufferStreamRead)
        /*frameBufferStream = new stream.PassThrough();
        console.log(buffer.length);
        frameBufferStream.push(buffer, 'binary')*/
        //_temp.pipe(frameBufferStream)
        //frameBufferStream.push(null)
      var command = ffmpeg(frameBufferStreamRead)
        //.inputFormat('rawvideo')
        .inputOptions([
          '-re',
          /*'-r 30',
          '-s 426x240',
          '-c:v rawvideo',
          '-pix_fmt', 'rgba',*/
        ])
        //.size('426x240')
        //.format('mp4')
        .outputOptions([
          '-copyts',
          '-c:v libx264',
          '-r 30',
          '-an',
          '-preset ultrafast',
          '-tune zerolatency',
          '-bsf:v h264_mp4toannexb',
          '-f mpegts',
        ])
        .output('udp://10.0.0.32:1234')
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

    } else {
      /*let _wrote = frameBufferStreamRead.push(buffer, 'binary')
      paused = !_wrote
      console.log(_wrote);
      //frameBufferStream.push(buffer, 'binary')
      frameBufferStreamRead.pipe(frameBufferStream)*/
    }
  }


  function addFromBuffer(outDir = __dirname, buffer, options = {}) {
    var saveName = options.saveName || `${uuid.v4()}`
    var duration = options.duration || 5
    var saveGroup = options.saveGroup
    var outWidth = options.width || OUT_W
    var outHeight = options.height || OUT_H
    var s = new stream.Readable();
    console.log(buffer.length);
    s.push(buffer);
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
          buffer.fill(0)
          buffer = null
          return path
        })
      })
    } else {
      return _saveRange(s, _obj)
    }
  }


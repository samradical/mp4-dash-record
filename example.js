const _recorder = new DASHSAVE({ffmpegPath:'./bin/ffmpeg'})
_recorder.saveDirectory = saveDirectory //where the images will be saved and things recorded,

//an audio buffer
_recorder.addAudio(buffer)
//an image
_recorder.saveImage(base64Str).finally()
//video buffer
_recorder.addFrame(buffer)

return _recorder.save(options)
      .then(final => {
Merge audio and video with ffmpeg.

Write in buffers, stored in memory and then on save piped into ffmpeg.

## API


`const recorder = new DASHSAVE({ffmpegPath:'./bin/ffmpeg'})`

- `recorder.imageExt =` how to save the base64 images. default: jpg

- `recorder.saveDirectory =` where to save all the files. Can override in save options

- `addAudio(buffer: typedarray)` any audio codec

- `addFrame(buffer: typedarray)` any video codec

- `saveImage(base64Str, options)` {saveDir:"path"}. Specify type with `imageExt`

- `save(options: {})` See below

```
{
width, //output width
      height, //output height
      saveDir, //override
      inputOptions, //ffmpeg input
      outputOptions, 
      withBuffers
}
```

See example.js

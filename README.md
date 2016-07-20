# British Pathé

`node upload.js --manifest downloaded_manifest_all.json`


Blank video upload

`ffmpeg  -f lavfi -i color=c=red:s=320x240   -i iching_24.wav  -shortest -c:v libx264 -y iching.mp4`
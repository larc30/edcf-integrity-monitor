#!/bin/bash
# 녹화본 아래에 자막 띠(110px)를 붙이고 자막을 입혀 MP4 로. burn.sh <raw> <ass> <out>
cd "$(dirname "$0")"
ffmpeg -y -loglevel error -i "$1" -vf "scale=1920:972:flags=lanczos,pad=1920:1080:0:0:color=0x0B101C,drawbox=x=0:y=972:w=1920:h=108:color=0x0E1424:t=fill,drawbox=x=0:y=972:w=1920:h=2:color=0x2A3554:t=fill,subtitles=$2:fontsdir=../font/web" -c:v libx264 -preset medium -crf 21 -pix_fmt yuv420p -movflags +faststart -r 25 "$3"

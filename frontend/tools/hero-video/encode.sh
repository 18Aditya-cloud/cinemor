#!/bin/sh
# Turns the rendered frames into the two files the site uses. Run from this folder after render.py.
# crf 19 (1080p) and crf 15 (720p) are the lowest-size settings that kept the dark gradients free of banding.
set -e
ffmpeg -y -framerate 24 -i frames/f_%04d.jpg -c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart -an ../../src/assets/video/hero-bg-1080.mp4
ffmpeg -y -framerate 24 -i frames/f_%04d.jpg -vf "scale=1280:720:flags=lanczos" -c:v libx264 -preset slow -crf 15 -pix_fmt yuv420p -profile:v high -movflags +faststart -an ../../src/assets/video/hero-bg-720.mp4
ffmpeg -y -i ../../src/assets/video/hero-bg-1080.mp4 -frames:v 1 -q:v 3 ../../src/assets/images/hero-bg-poster.jpg

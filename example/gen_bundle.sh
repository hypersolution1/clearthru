#!/bin/sh

rm -f ./public/bundle.js
browserify -r ..:clearthru -o ./public/bundle.js
[ $? != "0" ] && exit 1

exit 0
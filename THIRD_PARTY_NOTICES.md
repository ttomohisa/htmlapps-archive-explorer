# Third-Party Notices

## LZMA-JS

Archive Explorer v1.3 embeds the decompression-only build of **LZMA-JS** for LZMA-compressed 7z streams.

- Project: LZMA-JS
- Package: `lzma` 2.3.2
- Source: https://github.com/LZMA-JS/LZMA-JS
- License: MIT

The vendored source is stored at `src/vendor/lzma-d-min.js` and is embedded into the standalone HTML.

### License text

© 2016 Nathan Rugg <nmrugg@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Application parsers

ZIP, RAR5, TAR, GZIP, CAB, ISO 9660 and LZH parsing logic is application code included in this repository and does not require additional runtime libraries.

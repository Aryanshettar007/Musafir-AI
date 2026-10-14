/**
 * Lightweight mock for punycode Node built-in module required by markdown-it.
 * React Native does not provide Node standard library modules.
 */
module.exports = {
  toASCII: function (input) {
    return input;
  },
  toUnicode: function (input) {
    return input;
  },
  encode: function (input) {
    return input;
  },
  decode: function (input) {
    return input;
  },
  ucs2: {
    encode: function (array) {
      return String.fromCodePoint ? String.fromCodePoint.apply(String, array) : '';
    },
    decode: function (string) {
      var output = [];
      var counter = 0;
      var length = string.length;
      while (counter < length) {
        var value = string.charCodeAt(counter++);
        if (value >= 0xd800 && value <= 0xdbff && counter < length) {
          var extra = string.charCodeAt(counter++);
          if ((extra & 0xfc00) === 0xdc00) {
            output.push(((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000);
          } else {
            output.push(value);
            counter--;
          }
        } else {
          output.push(value);
        }
      }
      return output;
    },
  },
  version: '2.3.1',
};

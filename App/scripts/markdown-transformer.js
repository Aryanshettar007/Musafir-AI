const upstreamTransformer = require('@expo/metro-config/babel-transformer');

module.exports.transform = function (props) {
  if (props.filename.endsWith('.md')) {
    return upstreamTransformer.transform({
      ...props,
      src: `module.exports = ${JSON.stringify(props.src)};`,
    });
  }
  return upstreamTransformer.transform(props);
};

if (upstreamTransformer.getCacheKey) {
  module.exports.getCacheKey = upstreamTransformer.getCacheKey;
}

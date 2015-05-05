exports.config = {
  modules: [
    'babel',
    'copy'
  ],

  watch: {
    sourceDir: 'src',
    compiledDir: 'lib',
    javascriptDir: null
  },

  babel: {
    options: {
      sourceMap: false
    }
  }
};
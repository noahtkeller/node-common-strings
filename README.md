# Node Common Strings

This compiles the [strings-source](https://github.com/noahtkeller/strings-source) repository for use with NodeJS.<br/>
Everything in here can be ignored except the gulpfile which handles reading and compiling the YAML files into JavaScript.
<p/>

There are 2 jobs to run:<br/>
`clean` : Remove all the automatically generated strings files and exports in `package.json`.<br/>
`build` : Read the `strings-source` files and compile them for use in JS, adds `exports` to `package.json`
<p/>

It outputs files for consumption via CommonJS as well as ESM.
<p/>

It compiles the resource bundles for [i18next](https://www.i18next.com/) as well as strings files containing the
translation keys.

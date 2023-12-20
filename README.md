# @oraichain/notebookjs

Notebook.js parses raw [Jupyter](http://jupyter.org/)/[IPython](http://ipython.org/) notebooks, and lets you render them as HTML. See a **[working demo here](https://cw-notebook.web.app/)**.

## Usage

```js
import nb from './notebook';

nb.updateDepedencies({
  'ts-results': require('ts-results'),
  bech32: require('bech32'),
  '@cosmjs/stargate': require('@cosmjs/stargate'),
  '@cosmjs/cosmwasm-stargate': require('@cosmjs/cosmwasm-stargate'),
  '@oraichain/cw-simulate': require('@oraichain/cw-simulate'),
  '@oraichain/cosmwasm-vm-zk': require('@oraichain/cosmwasm-vm-zk'),
  '@oraichain/common-contracts-sdk': require('@oraichain/common-contracts-sdk'),
  '@oraichain/oraidex-contracts-sdk': require('@oraichain/oraidex-contracts-sdk'),
  '@oraichain/dao-contracts-sdk': require('@oraichain/dao-contracts-sdk')
});

// fetch notebook
const notebook = await nb.fetch('notebook.ipynb');
document.body.appendChild(notebook.render());

// run all notebook
await nb.runAll();
```

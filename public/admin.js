import { formatEther, isAddress, parseEther, toHex } from 'https://esm.sh/viem@2.21.55'
import { ANVIL, DEV_ACCOUNTS } from './config.js'
import { el } from './dom.js'
import { $, copyButton, log, on, renderHeader, short, walletPicker } from './ui.js'
import { connect, switchChain } from './wallets.js'

const COMMANDS = [
  ['Subir a rede', 'anvil --chain-id 31337 --block-time 2'],
  ['Compilar o contrato', 'forge build --root contracts'],
  ['Deploy via CLI (conta #0)', `forge create src/MessageInbox.sol:MessageInbox --root contracts --rpc-url ${ANVIL.rpc} --private-key ${DEV_ACCOUNTS[0].key} --broadcast`],
  ['Dar ETH via CLI', `cast rpc anvil_setBalance <endereço> ${toHex(parseEther('100'))} --rpc-url ${ANVIL.rpc}`],
  ['Manter a rede entre reinícios (carrega o arquivo ao subir, salva ao sair com Ctrl+C)', 'anvil --chain-id 31337 --block-time 2 --state anvil-state.json'],
  ['Resetar a rede sem reiniciar (volta ao bloco 0: apaga contratos, saldos e nonces)', `cast rpc anvil_reset --rpc-url ${ANVIL.rpc}`],
]

let providers = []
const watched = new Set()

async function rpc(method, params = []) {
  const res = await fetch(ANVIL.rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

const address = () => {
  const a = $('faucetAddr').value.trim()
  if (!isAddress(a)) throw new Error('Endereço inválido')
  return a
}

async function ping() {
  const [chainId, block] = await Promise.all([rpc('eth_chainId'), rpc('eth_blockNumber')])
  $('rpcState').textContent = `Online · chainId ${Number(chainId)} · bloco ${Number(block)}`
  log(`RPC ${ANVIL.rpc} ok, bloco ${Number(block)}`)
}

function showAccount(name, account) {
  $('walletBadge').textContent = account ? short(account, 4) : 'desconectado'
  $('chainState').textContent = account ? `${name} · ${short(account, 6)} · ${ANVIL.name} ✓` : ''
  if (account) $('faucetAddr').value = account
}

// Conecta a carteira escolhida e leva para o Anvil (adiciona a rede se faltar). O erro diz de qual carteira veio.
async function doConnect() {
  const picked = providers[Number($('injected').value)]
  if (!picked) throw new Error('Nenhuma carteira injetada encontrada')
  const { name } = picked.info
  try {
    const { address: account } = await connect(picked.provider)
    await switchChain(picked.provider, ANVIL)
    if (!watched.has(picked.provider)) picked.provider.on?.('accountsChanged', ([a]) => showAccount(name, a))
    watched.add(picked.provider)
    showAccount(name, account)
    log(`${name} conectada no ${ANVIL.name}: ${short(account, 6)}`)
  } catch (e) {
    throw new Error(`${name}: ${e.message}`, { cause: e })
  }
}

async function showBalance() {
  const wei = await rpc('eth_getBalance', [address(), 'latest'])
  $('faucetState').textContent = `Saldo: ${Number(formatEther(BigInt(wei))).toFixed(4)} ETH`
}

async function faucet() {
  await rpc('anvil_setBalance', [address(), toHex(parseEther('100'))])
  log(`anvil_setBalance 100 ETH → ${short(address(), 6)}`)
  await showBalance()
}

function renderCommands() {
  for (const [label, cmd] of COMMANDS) {
    const pre = el('pre', '', cmd)
    $('commands').append(el('p', 'hint', label), el('div', 'command', pre, copyButton(cmd)))
  }
}

function renderAccounts() {
  for (const a of DEV_ACCOUNTS) {
    $('accounts').append(el('tr', '',
      el('td', '', String(a.index)),
      el('td', '', a.address, ' ', copyButton(a.address)),
      el('td', '', short(a.key, 8), ' ', copyButton(a.key)),
    ))
  }
}

function init() {
  renderHeader('admin.html')
  walletPicker($('injected')).then((list) => { providers = list })
  renderCommands()
  renderAccounts()
  on('ping', ping)
  on('connect', doConnect)
  on('faucet', faucet)
  on('balance', showBalance)
  ping().catch((e) => { $('rpcState').textContent = `Offline: ${e.message}` })
}

init()

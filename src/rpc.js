import * as config from './configuration'
import * as util from './util'
import * as agent from './agent'
import { utils } from 'near-api-js'
import chalk from 'chalk'

export async function call(method, args, isView, gas = config.BASE_GAS_FEE, amount = config.BASE_ATTACHED_PAYMENT) {
  const account = args.account || args.account_id || args.agent_account_id || config.AGENT_ACCOUNT_ID
  const manager = await util.getCronManager(account, args)
  const params = method === 'unregister' ? {} : util.removeUnneededArgs(args)
  let res
  if (config.LOG_LEVEL === 'debug') console.log(account, isView, manager[method], params, gas, amount);

  try {
    res = isView
      ? await manager[method](params)
      : await manager[method]({
        args: params,
        gas,
        amount: utils.format.parseNearAmount(`${amount}`),
      })
  } catch (e) {
    if (e && e.panic_msg) {
      console.log('\n')
      console.log('\t' + chalk.red(e.panic_msg.split(',')[0].replace('panicked at ', '').replace(/\'/g, '')))
      console.log('\n')
    }
    if (config.LOG_LEVEL === 'debug') console.log('rpcFunction', e);
  }

  if (res && !isView) return res
  if (!res && !isView) console.log('\n\t' + chalk.green(`${method} Success!`) + '\n')
  if (!res && isView) console.log(chalk.green(`No response data`))

  if (isView && res) {
    try {
      const payload = typeof res === 'object' ? res : JSON.parse(res)

      if (method === 'get_agent') {
        const balance = await agent.getAgentBalance()
        const formattedBalance = utils.format.formatNearAmount(balance)
        payload.wallet_balance = formattedBalance
      }

      if (payload.balance) {
        payload.reward_balance = utils.format.formatNearAmount(payload.balance)
        delete payload.balance
      }

      console.log('\n')
      Object.keys(payload).forEach(k => {
        console.log(`${chalk.bold.white(k.replace(/\_/g, ' '))}: ${chalk.white(payload[k])}`)
      })
      console.log('\n')
    } catch (ee) {
      console.log(`${chalk.bold.white(method.replace(/\_/g, ' '))}: ${chalk.white(res)}`)
      if (config.LOG_LEVEL === 'debug') console.log('rpcFunction view:', ee);
    }
  }

  if (method === 'get_agent') {
    // Check User Balance
    const balance = await agent.getAgentBalance()

    // ALERT USER is their balance is lower than they should be
    if (!balance || balance < 3e24) {
      console.log(`${chalk.bold.red('Attention!')}: ${chalk.redBright('Please add more funds to your account to continue sending transactions')}`)
      console.log(`${chalk.bold.red('Current Account Balance:')}: ${chalk.redBright(utils.format.formatNearAmount(balance))}\n`)

      await notifySlack(`*Attention!* Please add more funds to your account to continue sending transactions.\nCurrent Account Balance: *${utils.format.formatNearAmount(balance)}*`)
    }
  }
}

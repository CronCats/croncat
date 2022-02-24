import * as config from './configuration'
import * as agent from './agent'
import * as util from './util'
import chalk from 'chalk'

// returns if agent should skip next call or not
export const getTasks = async () => {
  const manager = await util.getCronManager()
  const agentId = config.AGENT_ACCOUNT_ID
  let skipThisIteration = false
  let totalTasks = 0
  let taskRes

  try {
    // Only get task hashes my agent can execute
    taskRes = await manager.get_agent_tasks({ account_id: agentId })
  } catch (e) {
    console.log(`${chalk.red('Connection interrupted, trying again soon...')}`)
    util.dbug('getTasks', e);
    // Wait, then try loop again.
    skipThisIteration = true
    return;
  }
  totalTasks = parseInt(taskRes[0])
  if (taskRes[1] === '0') console.log(`${chalk.gray(new Date().toISOString())} ${chalk.gray('[' + manager.account.connection.networkId.toUpperCase() + ' ' + agentId + ']')} Tasks: ${chalk.red(totalTasks)}, Current Slot: ${chalk.red('Paused')}`)
  else console.log(`${chalk.gray(new Date().toISOString())} ${chalk.gray('[' + manager.account.connection.networkId.toUpperCase() + ' ' + agentId + ']')} Tasks: ${chalk.blueBright(totalTasks)}, Current Slot: ${chalk.yellow(taskRes[1])}`)

  util.dbug('taskRes', taskRes)
  if (totalTasks <= 0) skipThisIteration = true

  return skipThisIteration
}

// returns if agent should skip next call or not
export const proxyCall = async () => {
  const manager = await util.getCronManager()
  let skipThisIteration = false

  try {
    const res = await manager.proxy_call({
      args: {},
      gas: config.BASE_GAS_FEE,
      amount: config.BASE_ATTACHED_PAYMENT,
    })
    // util.dbug(res)
    if (res && res.transaction_outcome && res.transaction_outcome.id) util.dbug(`${chalk.yellowBright('TX:' + res.transaction_outcome.id)}`)
  } catch (e) {
    util.dbug('proxy_call issue', e)
    // Check if the agent should slow down to wait for next slot opportunity
    if (e.type && e.type === 'FunctionCallError') {
      // Check if we need to skip iteration based on max calls in this slot, so we dont waste more fees.
      if (e.kind.ExecutionError.search('Agent has exceeded execution for this slot') > -1) {
        skipThisIteration = true
      }
    }
  }

  return skipThisIteration
}

let agentSettings = {}
export async function run() {
  let skipThisIteration = false
  let previousAgentSettings = { ...agentSettings }
  agentSettings = agent.settings()

  // 1. Check for tasks
  skipThisIteration = await getTasks()

  // 2. Check agent kicked, if so, stop the loop until auto-reregister kicks in
  if (
    previousAgentSettings && previousAgentSettings.status === 'Active' && 
    agentSettings && !agentSettings.status
  ) skipThisIteration = true

  // 3. Sign task and submit to chain
  if (!skipThisIteration) skipThisIteration = await proxyCall()

  // 4. Wait, then loop again.
  // Run immediately if executed tasks remain for this slot, then sleep until next slot.
  const nextAttemptInterval = skipThisIteration ? config.WAIT_INTERVAL_MS : 100
  setTimeout(run, nextAttemptInterval)
}

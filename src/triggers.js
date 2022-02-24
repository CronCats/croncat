import * as config from './configuration'
import * as util from './util'
import chalk from 'chalk'

let cache = []
// Update cache every slot duration (60 blocks)
const CACHE_DELAY = 60 * 1000
const TIME_GRANULARITY = 100 * 10000
let lastCacheCheckTs = +new Date() - CACHE_DELAY
let triggersProcessed = 0
let triggersExecuted = 0

// Get trigger list
export const getTriggers = async (from_index = 0, limit = 100) => {
  const manager = await util.getCronManager()

  let triggers = []
  try {
    // Only get task hashes my agent can execute
    triggers = await manager.get_triggers({ from_index: `${from_index}`, limit: `${limit}` })
  } catch (e) {
    util.dbug('getTriggers', e)
  }

  return triggers
}

// Get trigger cache
// cache for current triggers list & configs
export const getAllTriggers = async () => {
  if (lastCacheCheckTs + CACHE_DELAY > +new Date()) return cache
  cache = []
  let index = 0
  // loop getting triggers until no more results
  async function loopRetrieve() {
    const triggers = await getTriggers(index)
    index += 1

    if (triggers && triggers.length > 0) {
      cache = cache.concat(triggers)
      setImmediate(loopRetrieve)
    }
  }
  await loopRetrieve()
  lastCacheCheckTs = +new Date()
  
  // stats logging
  const manager = await util.getCronManager()
  console.log(`${chalk.gray(new Date().toISOString())} ${chalk.gray('[' + manager.account.connection.networkId.toUpperCase() + ']')} Triggers: ${chalk.blueBright(cache.length)}, Processed: ${chalk.yellow(triggersProcessed)}, Executed: ${chalk.yellow(triggersExecuted)}`)
  // reset after log
  triggersProcessed = 0
  triggersExecuted = 0

  return cache
}

// Call any contract with a "view" RPC call
export const viewTrigger = async trigger_hash => {
  let trigger
  let outcome = false
  cache.forEach(t => {
    if (t.hash === trigger_hash) trigger = {...t}
  })
  if (!trigger) return outcome

  try {
    // Check if the trigger evaluates to true or false
    const res = await util.queryRpc(`${trigger.contract_id}`, `${trigger.function_id}`, null, null, trigger.arguments)
    util.dbug('callTrigger res', res)
    if (!res) outcome = false
    // res should return a standard payload: (bool, Base64VecU8)
    if (typeof res === 'boolean') outcome = res
    if (typeof res === 'object' && typeof res[0] === 'boolean') outcome = res[0]
  } catch (e) {
    util.dbug('callTrigger', e)
  }
  triggersProcessed += 1

  return outcome
}

// Performs the paid txn for calling a trigger
// NOTE: Must be careful here, as fast & high amounts of triggers could drain balance quickly!
export const callTrigger = async trigger_hash => {
  const manager = await util.getCronManager()

  try {
    // Only get task hashes my agent can execute
    const res = await manager.proxy_conditional_call({ 
      args: { trigger_hash },
      gas: config.BASE_GAS_FEE,
      amount: config.BASE_ATTACHED_PAYMENT,
    })
    util.dbug('callTrigger res', res)
  } catch (e) {
    util.dbug('callTrigger', e)
  }
  triggersExecuted += 1
}

// NOTE: This is built to be SPEED optimized, rather than safe on account balance. Meaning failed TXNs can happen for lack of balance.
// NOTE: This functionality will not get turned on until Agent is Active
// NOTE: This is built without batching, could be implemented in the future
export async function run() {
  const allTriggers = await getAllTriggers()

  // If there aren't any triggers, wait a while before checking for more
  if (!allTriggers || allTriggers.length <= 0) return setTimeout(run, CACHE_DELAY)

  // speed range
  // protect the runtime of triggers with high resolution timer
  // NOTE: Probably overkill, but allows for easy acceleration if needed to accommodate faster block times
  const sr_start = process.hrtime()

  // Logic:
  //  - Call every trigger to check if any triggers are evaluating to TRUE
  //  - If TRUE, do 'proxy_conditional_call' call
  await allTriggers.reduce(async (ctx, trigger, i) => {
    const shouldCall = await viewTrigger(trigger.hash)
    if (shouldCall) await callTrigger(trigger.hash)
    return [...ctx, i + 1]
  }, [])

  // end speed range
  const sr_end = process.hrtime(sr_start)

  // Check if RPC processing time too longer than interval, if so do next immediately
  const exec_duration = sr_end[1] / TIME_GRANULARITY
  if (exec_duration > config.TRIGGER_INTERVAL_MS) run()
  else setTimeout(run, Math.abs(config.TRIGGER_INTERVAL_MS - exec_duration))
}

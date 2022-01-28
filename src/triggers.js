import * as config from './configuration'
import * as util from './util'

let cache = []
let lastCacheCheckTs = +new Date()
// Update cache every slot duration (60 blocks)
const CACHE_DELAY = 60 * 1000

// Get trigger list
export const getTriggers = async (from_index = 0, limit = 100) => {
  const manager = await util.getCronManager()

  let triggers = []
  try {
    // Only get task hashes my agent can execute
    triggers = await manager.get_triggers({ from_index, limit })
    console.log('triggers', triggers)
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('getTriggers', e)
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
}

// Call any contract with a "view" RPC call
export const viewTrigger = async trigger_hash => {
  const trigger = cache[triggerHash]
  let outcome = false

  try {
    // Check if the trigger evaluates to true or false
    const res = await util.queryRpc(`${trigger.contract_id}`, `${trigger.function_id}`, null, null, trigger.arguments)
    if (!res) this.validFunctionId = false
    if (res) {
      // looking for specific error message to confirm function exists
      if (res.search('MethodNotFound') > -1) {
        this.validFunctionId = false
      } else this.validFunctionId = true
    }
    console.log('callTrigger res', res)
    // check outcome === true
    // res should return a standard payload: (bool, Base64VecU8)
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('callTrigger', e)
  }

  return outcome
}

// Performs the paid txn for calling a trigger
// NOTE: Must be careful here, as fast & high amounts of triggers could drain balance quickly!
export const callTrigger = async trigger_hash => {
  const manager = await util.getCronManager()
  const trigger = cache[triggerHash]

  try {
    // Only get task hashes my agent can execute
    const res = await manager.proxy_conditional_call({ trigger_hash })
    console.log('callTrigger res', res)
  } catch (e) {
    if (LOG_LEVEL === 'debug') console.log('callTrigger', e)
  }
}

// NOTE: This is built to be SPEED optimized, rather than safe on account balance. Meaning failed TXNs can happen for lack of balance.
// NOTE: This functionality will not get turned on until Agent is Active
// NOTE: This is built without batching, could be implemented in the future
export async function run() {
  const allTriggers = await getAllTriggers()

  // If there aren't any triggers, wait a while before checking for more
  if (!allTriggers || allTriggers.length <= 0) {
    setTimeout(() => { run() }, CACHE_DELAY)
    return
  }

  // Logic:
  //  - Call every trigger to check if any triggers are evaluating to TRUE
  //  - If TRUE, do 'proxy_conditional_call' call
  await allTriggers.reduce(async (trigger, i) => {
    const shouldCall = await viewTrigger(trigger.hash)
    if (shouldCall) await callTrigger(trigger.hash)
    return [...trigger, i + 1]
  }, [])

  // TODO: Check if RPC processing time too longer than interval, if so do next immediately
  // TODO: Add logging & stats logging if desired
  // Wait, then loop again.
  setTimeout(() => { run() }, config.TRIGGER_INTERVAL_MS)
}

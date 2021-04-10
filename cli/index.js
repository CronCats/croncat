import { registerAgent, agentFunction } from '../src/actions'

exports.registerAgent = async function (options) {
    await registerAgent(options);
}

exports.unregisterAgent = async function (options) {
    await agentFunction('unregister_agent', options);
}

exports.updateAgent = async function (options) {
    await agentFunction('update_agent', options);
}

exports.withdrawBalance = async function (options) {
    await agentFunction('withdraw_task_balance', options);
}

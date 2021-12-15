const path = require("path");
const { writeFileSync } = require("fs");

const generateDaemon = (env = 'testnet', user = 'near') => {
  return `Description=CronCat ${env.toUpperCase()} Agent
After=multi-user.target

[Service]
Type=simple
User=${user}
WorkingDirectory=/home/${user}/croncat/${env}
ExecStart=/usr/bin/croncat go
StandardOutput=append:/var/log/croncat_${env}.log
StandardError=append:/var/log/croncat_${env}error.log
Restart=on-failure
RestartSec=60
KillSignal=SIGINT
TimeoutStopSec=45
KillMode=mixed

[Install]
WantedBy=multi-user.target`
}

export const createDaemonFile = async (env) => {
  const _env = env || process.env.NEAR_ENV || 'testnet'
  const user = require("os").userInfo().username
  const daemon = generateDaemon(_env, user)

  await writeFileSync(path.join(process.cwd(), `croncat_${_env}.service`), daemon)
}

// // NOTE: for testing
// ;(async () => {
//   await createDaemonFile()
// })()
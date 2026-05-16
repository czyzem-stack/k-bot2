export type DeployChannel = 'dev' | 'live'

const raw = import.meta.env.VITE_DEPLOY_CHANNEL

/** `dev` = development branch; `live` = main / production line. */
export const DEPLOY_CHANNEL: DeployChannel = raw === 'live' ? 'live' : 'dev'

export const DEPLOY_CHANNEL_LABEL = DEPLOY_CHANNEL === 'live' ? 'LIVE' : 'DEV'

export const DEPLOY_CHANNEL_HINT =
  DEPLOY_CHANNEL === 'live'
    ? 'Main line — stable release (port 5173 when using dev:all)'
    : 'Development line — active work (port 5174 when using dev:all)'

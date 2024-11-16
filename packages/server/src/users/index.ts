// 支持配置文件配置
import _users from './../../users.toml'

export const users: Record<string, string[][]> = _users as any

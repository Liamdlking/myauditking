export type Role = 'admin' | 'manager' | 'inspector'

export type CurrentUser = {
  id: string
  email: string
  name?: string | null
  role?: Role
  roles?: Role[]
  site_access?: string[] | null
  is_banned?: boolean
}

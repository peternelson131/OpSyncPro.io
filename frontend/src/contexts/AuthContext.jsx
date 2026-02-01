import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionError, setSessionError] = useState(null)
  const navigate = useNavigate()
  const healthCheckIntervalRef = useRef(null)

  // Manual session refresh function
  const refreshSession = async () => {
    try {
      console.log('🔄 Manually refreshing session...')
      const { data: { session }, error } = await supabase.auth.refreshSession()
      
      if (error) {
        console.error('❌ Session refresh failed:', error)
        setSessionError(error.message)
        return { success: false, error }
      }

      if (session) {
        console.log('✅ Session refreshed successfully')
        setUser(session.user)
        setSessionError(null)
        return { success: true, session }
      } else {
        console.warn('⚠️ No session returned from refresh')
        setSessionError('No session available')
        return { success: false, error: new Error('No session available') }
      }
    } catch (error) {
      console.error('❌ Session refresh error:', error)
      setSessionError(error.message)
      return { success: false, error }
    }
  }

  // Periodic session health check
  const startSessionHealthCheck = () => {
    // Clear any existing interval
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
    }

    // Check session health every 5 minutes
    healthCheckIntervalRef.current = setInterval(async () => {
      console.log('🏥 Performing session health check...')
      
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('❌ Session health check failed:', error)
        setSessionError(error.message)
        return
      }

      if (!session) {
        console.warn('⚠️ Session health check: No active session, redirecting to login')
        setUser(null)
        setSessionError('Session expired')
        navigate('/login', { state: { message: 'Your session has expired. Please log in again.' } })
        return
      }

      // Check if session is about to expire (within 5 minutes)
      const expiresAt = session.expires_at
      const now = Math.floor(Date.now() / 1000)
      const timeUntilExpiry = expiresAt - now

      if (timeUntilExpiry < 300) {
        console.log('⏰ Session expiring soon, refreshing...')
        await refreshSession()
      } else {
        console.log('✅ Session healthy, expires in', Math.floor(timeUntilExpiry / 60), 'minutes')
      }
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  const stopSessionHealthCheck = () => {
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current)
      healthCheckIntervalRef.current = null
    }
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('❌ Error getting initial session:', error)
        setSessionError(error.message)
        setLoading(false)
        return
      }

      if (session) {
        console.log('✅ Initial session loaded')
        setUser(session.user)
        setSessionError(null)
        startSessionHealthCheck()
      } else {
        console.log('ℹ️ No initial session found')
        setUser(null)
      }
      
      setLoading(false)
    })

    // Listen for auth changes with enhanced event handling
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔐 Auth state change:', event, session?.user?.email || 'no user')

      switch (event) {
        case 'INITIAL_SESSION':
          // Initial session loaded
          if (session) {
            setUser(session.user)
            setSessionError(null)
            startSessionHealthCheck()
          }
          break

        case 'SIGNED_IN':
          // User signed in
          if (session) {
            console.log('✅ User signed in:', session.user.email)
            setUser(session.user)
            setSessionError(null)
            startSessionHealthCheck()
          }
          break

        case 'SIGNED_OUT':
          // User signed out
          console.log('👋 User signed out')
          setUser(null)
          setSessionError(null)
          stopSessionHealthCheck()
          navigate('/login')
          break

        case 'TOKEN_REFRESHED':
          // Token was refreshed
          console.log('🔄 Token refreshed successfully')
          if (session) {
            setUser(session.user)
            setSessionError(null)
          } else {
            console.warn('⚠️ Token refreshed but no session available')
            setSessionError('Token refresh failed')
          }
          break

        case 'USER_UPDATED':
          // User data was updated
          console.log('👤 User updated')
          if (session) {
            setUser(session.user)
          }
          break

        case 'PASSWORD_RECOVERY':
          // Password recovery email sent
          console.log('🔑 Password recovery initiated')
          break

        default:
          console.log('ℹ️ Unhandled auth event:', event)
      }

      setLoading(false)
    })

    // Cleanup on unmount
    return () => {
      subscription.unsubscribe()
      stopSessionHealthCheck()
    }
  }, [navigate])

  const signUp = async (email, password, userData) => {
    try {
      setSessionError(null)
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: window.location.origin
        }
      })

      if (error) throw error

      // Create user profile
      if (data.user) {
        const { error: profileError } = await supabase
          .from('users')
          .insert({
            id: data.user.id,
            email: data.user.email,
            name: userData.name || email.split('@')[0]
          })

        if (profileError) {
          console.warn('⚠️ Profile creation failed (may already exist):', profileError)
        }
      }

      return data
    } catch (error) {
      setSessionError(error.message)
      throw error
    }
  }

  const signIn = async (email, password) => {
    try {
      setSessionError(null)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error
      
      // Session health check will be started by onAuthStateChange
      return data
    } catch (error) {
      setSessionError(error.message)
      throw error
    }
  }

  const signOut = async () => {
    try {
      setSessionError(null)
      stopSessionHealthCheck()
      
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      
      setUser(null)
    } catch (error) {
      setSessionError(error.message)
      throw error
    }
  }

  const resetPassword = async (email) => {
    try {
      setSessionError(null)
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      })
      
      if (error) throw error
    } catch (error) {
      setSessionError(error.message)
      throw error
    }
  }

  const value = {
    user,
    loading,
    sessionError,
    signUp,
    signIn,
    signOut,
    resetPassword,
    refreshSession,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

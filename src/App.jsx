import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import './Settings.css'
import { auth, db } from './firebase.js'
import { supabase } from './supabase.js'
import CallWindow from './CallWindow.jsx'

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  deleteUser
} from 'firebase/auth'

import {
  doc,
  setDoc,
  serverTimestamp,
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  addDoc,
  getDoc,
  deleteDoc,
  updateDoc,
  orderBy,
  limit
} from 'firebase/firestore'

const BUCKET_NAME = 'novachat-media'
const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥']

async function uploadToSupabase(path, file, contentType) {
  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: contentType || file.type || 'application/octet-stream',
      upsert: false
    })

  if (error) throw error

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(path)

  return data.publicUrl
}

const initials = name => (name || 'U').trim().slice(0, 1).toUpperCase()

const timeText = value => {
  if (!value?.toDate) return '...'
  return value.toDate().toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const lastSeenText = value => {
  if (!value?.toDate) return 'нещодавно'
  const date = value.toDate()
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000)
  if (diffMin < 1) return 'щойно'
  if (diffMin < 60) return `${diffMin} хв тому`
  return date.toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const isExpired = story => {
  const exp = story?.expiresAt?.toMillis?.()
  return exp ? exp <= Date.now() : false
}

const formatAuthError = err => {
  const code = err?.code || ''
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
    return 'Невірна пошта або пароль.'
  }
  if (code === 'auth/email-already-in-use') {
    return 'Ця електронна пошта вже зареєстрована.'
  }
  if (code === 'auth/weak-password') {
    return 'Пароль занадто слабкий (мінімум 6 символів).'
  }
  if (code === 'auth/invalid-email') {
    return 'Некоректний формат електронної пошти.'
  }
  return err?.message || 'Сталася помилка авторизації.'
}

function Avatar({ photoURL, className = 'avatar', fallback = '👤', alt = 'Аватар' }) {
  return (
    <div className={className}>
      {photoURL ? <img src={photoURL} alt={alt} loading="lazy" /> : fallback}
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Авторизація
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Дзвінки та чати
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [chats, setChats] = useState([])
  const [chatFilter, setChatFilter] = useState('all') // 'all' | 'groups' | 'direct'
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  // Пошук користувачів та профілі
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [profiles, setProfiles] = useState({})
  const [viewProfileUid, setViewProfileUid] = useState(null)

  // Налаштування
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState('profile')
  const [profileName, setProfileName] = useState('')
  const [profileAbout, setProfileAbout] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('novaSound') !== 'false')
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => localStorage.getItem('novaNotifications') === 'true')
  const [theme, setTheme] = useState(() => localStorage.getItem('novaTheme') || 'dark')
  const [language, setLanguage] = useState(() => localStorage.getItem('novaLanguage') || 'uk')
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)

  // Функції чату, історій та TikTok-кліпів
  const [typingUsers, setTypingUsers] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [editingMessage, setEditingMessage] = useState(null)
  const [recording, setRecording] = useState(false)
  const [recordingSec, setRecordingSec] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [stories, setStories] = useState([])
  const [storyViewer, setStoryViewer] = useState(null)
  const [showGroupCreator, setShowGroupCreator] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupEmails, setGroupEmails] = useState('')
  const [showChatMenu, setShowChatMenu] = useState(false)
  const [showEmojiFor, setShowEmojiFor] = useState(null)
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')

  const [reelsOpen, setReelsOpen] = useState(false)
  const [reels, setReels] = useState([])
  const [reelIndex, setReelIndex] = useState(0)
  const [reelCaption, setReelCaption] = useState('')
  const [reelComments, setReelComments] = useState([])
  const [reelCommentText, setReelCommentText] = useState('')

  const messagesEndRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const typingActiveRef = useRef(false)
  const recorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordTimerRef = useRef(null)
  const fileInputRef = useRef(null)
  const storyInputRef = useRef(null)
  const reelInputRef = useRef(null)
  const seenMessageIdsRef = useRef(new Set())
  const initialMessagesLoadedRef = useRef(false)

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeId) || null,
    [chats, activeId]
  )
  const filteredChats = useMemo(() => {
    if (chatFilter === 'groups') return chats.filter(c => Boolean(c.isGroup))
    if (chatFilter === 'direct') return chats.filter(c => !c.isGroup)
    return chats
  }, [chats, chatFilter])

  const participantIds = activeChat?.participants || []
  const otherUids = useMemo(
    () => participantIds.filter(uid => uid !== user?.uid),
    [participantIds, user?.uid]
  )
  const otherUid = otherUids[0]
  const activeProfile = profiles[otherUid] || {}
  const activeName = activeChat?.isGroup
    ? activeChat.name || 'Груповий чат'
    : activeProfile.name || activeChat?.participantNames?.[otherUid] || 'Особистий чат'
  const viewedProfile = viewProfileUid ? profiles[viewProfileUid] || {} : {}

  const filteredMessages = useMemo(() => {
    const q = chatSearchQuery.trim().toLowerCase()
    if (!q) return messages
    return messages.filter(m => (m.text || '').toLowerCase().includes(q))
  }, [messages, chatSearchQuery])

  const currentReel = reels[reelIndex] || null

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser)
      setLoading(false)
    })
    return unsub
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('novaTheme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('novaLanguage', language)
  }, [language])

  useEffect(() => {
    if (!user) return
    setProfileName(user.displayName || '')
    setProfilePhoto(user.photoURL || '')
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (snap.exists()) {
          const data = snap.data()
          setProfileName(data.name || user.displayName || '')
          setProfileAbout(data.about || '')
          setProfilePhoto(data.photoURL || user.photoURL || '')
        }
      })
      .catch(console.error)
  }, [user])

  const trackedUserIds = useMemo(() => {
    if (!user) return []
    const set = new Set([
      user.uid,
      ...chats.flatMap(c => c.participants || []),
      ...searchResults.map(x => x.uid).filter(Boolean),
      ...(viewProfileUid ? [viewProfileUid] : [])
    ])
    return [...set].sort()
  }, [user, chats, searchResults, viewProfileUid])

  useEffect(() => {
    if (!user || trackedUserIds.length === 0) {
      if (!user) setProfiles({})
      return
    }

    const unsubs = trackedUserIds.map(uid =>
      onSnapshot(
        doc(db, 'users', uid),
        snap => {
          setProfiles(prev => {
            if (snap.exists()) {
              return { ...prev, [uid]: { uid, ...snap.data() } }
            }
            const next = { ...prev }
            delete next[uid]
            return next
          })
        },
        console.error
      )
    )

    return () => unsubs.forEach(fn => fn())
  }, [user, trackedUserIds])

  useEffect(() => {
    if (!user) {
      setChats([])
      setActiveId(null)
      return
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    )

    return onSnapshot(
      q,
      snap => {
        const list = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.updatedAt?.toMillis?.() || 0) - (a.updatedAt?.toMillis?.() || 0))

        setChats(list)
        setActiveId(current =>
          current && list.some(c => c.id === current) ? current : list[0]?.id || null
        )
      },
      err => {
        console.error(err)
        setError('Не вдалося завантажити чати. Перевір правила Firestore.')
      }
    )
  }, [user])

  useEffect(() => {
    if (!user) {
      setIncomingCall(null)
      return
    }

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid)
    )

    return onSnapshot(
      q,
      snap => {
        const calls = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(
            c =>
              c.createdBy !== user.uid &&
              c.status === 'ringing' &&
              (!c.createdAt?.toMillis || Date.now() - c.createdAt.toMillis() < 120000)
          )
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))

        if (!activeCall) {
          setIncomingCall(calls[0] || null)
        }
      },
      console.error
    )
  }, [user, activeCall])

  useEffect(() => {
    if (!user || !activeId) {
      setMessages([])
      seenMessageIdsRef.current.clear()
      initialMessagesLoadedRef.current = false
      return
    }

    seenMessageIdsRef.current.clear()
    initialMessagesLoadedRef.current = false
    setChatSearchOpen(false)
    setChatSearchQuery('')

    const q = query(
      collection(db, 'chats', activeId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(300)
    )

    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setMessages(list)

        if (!initialMessagesLoadedRef.current) {
          list.forEach(m => {
            seenMessageIdsRef.current.add(m.id)
            if (m.senderId !== user.uid && !m.read) {
              updateDoc(doc(db, 'chats', activeId, 'messages', m.id), { read: true }).catch(() => {})
            }
          })
          initialMessagesLoadedRef.current = true
          return
        }

        list.forEach(m => {
          if (m.senderId !== user.uid && !m.read && !document.hidden) {
            updateDoc(doc(db, 'chats', activeId, 'messages', m.id), { read: true }).catch(() => {})
          }
          if (!seenMessageIdsRef.current.has(m.id)) {
            seenMessageIdsRef.current.add(m.id)
            if (
              m.senderId !== user.uid &&
              notificationsEnabled &&
              'Notification' in window &&
              Notification.permission === 'granted' &&
              (document.hidden || !mobileChatOpen)
            ) {
              new Notification(m.senderName || 'Нове повідомлення', {
                body: m.text || (m.type === 'audio' ? '🎤 Голосове повідомлення' : '📎 Вкладення')
              })
            }
          }
        })
      },
      err => {
        console.error(err)
        setError('Не вдалося завантажити повідомлення.')
      }
    )
  }, [user, activeId, notificationsEnabled, mobileChatOpen])

  useEffect(() => {
    if (!user || !activeId) {
      setTypingUsers([])
      return
    }

    const q = collection(db, 'chats', activeId, 'typing')
    return onSnapshot(
      q,
      snap => {
        const now = Date.now()
        const activeTypers = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(
            x =>
              x.uid !== user.uid &&
              x.typing &&
              x.updatedAt?.toMillis &&
              now - x.updatedAt.toMillis() < 7000
          )
        setTypingUsers(activeTypers)
      },
      console.error
    )
  }, [user, activeId])

  useEffect(() => {
    if (!user) {
      setStories([])
      return
    }

    const q = query(
      collection(db, 'stories'),
      where('expiresAt', '>', new Date())
    )

    return onSnapshot(
      q,
      snap => {
        const valid = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(s => !isExpired(s))
        setStories(valid)
      },
      console.error
    )
  }, [user])

  // Стрічка коротких відео (TikTok / Reels)
  useEffect(() => {
    if (!user) {
      setReels([])
      return
    }

    const q = query(collection(db, 'reels'), orderBy('createdAt', 'desc'), limit(50))
    return onSnapshot(
      q,
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setReels(list)
        setReelIndex(idx => (list.length === 0 ? 0 : Math.min(idx, list.length - 1)))
      },
      console.error
    )
  }, [user])

  // Коментарі до поточного кліпу
  useEffect(() => {
    if (!user || !reelsOpen || !currentReel?.id) {
      setReelComments([])
      return
    }

    const q = query(
      collection(db, 'reels', currentReel.id, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(100)
    )
    return onSnapshot(
      q,
      snap => {
        setReelComments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      },
      console.error
    )
  }, [user, reelsOpen, currentReel?.id])

  useEffect(() => {
    if (!user) return

    const setPresence = online =>
      setDoc(
        doc(db, 'users', user.uid),
        {
          isOnline: online,
          lastSeen: serverTimestamp()
        },
        { merge: true }
      ).catch(() => {})

    const handleVisibility = () => {
      setPresence(document.visibilityState === 'visible')
    }

    const handleUnload = () => {
      setPresence(false)
    }

    handleVisibility()
    const interval = window.setInterval(handleVisibility, 45000)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
      setPresence(false)
    }
  }, [user])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, activeId, typingUsers.length])

  useEffect(() => {
    return () => {
      clearTimeout(typingTimeoutRef.current)
      clearInterval(recordTimerRef.current)
    }
  }, [])

  async function handleAuth(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      return setError('Заповни електронну пошту та пароль.')
    }
    if (mode === 'register' && !name.trim()) {
      return setError("Введи своє ім'я.")
    }
    if (password.length < 6) {
      return setError('Пароль повинен містити щонайменше 6 символів.')
    }

    setBusy(true)
    try {
      if (mode === 'register') {
        const cleanName = name.trim()
        const cleanEmail = email.trim().toLowerCase()
        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password)
        await updateProfile(result.user, { displayName: cleanName })
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          name: cleanName,
          email: cleanEmail,
          about: '',
          photoURL: '',
          createdAt: serverTimestamp(),
          isOnline: true,
          lastSeen: serverTimestamp()
        })
        setUser(result.user)
      } else {
        const result = await signInWithEmailAndPassword(auth, email.trim(), password)
        setUser(result.user)
      }
    } catch (err) {
      console.error(err)
      setError(formatAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    if (user) {
      await setDoc(
        doc(db, 'users', user.uid),
        { isOnline: false, lastSeen: serverTimestamp() },
        { merge: true }
      ).catch(() => {})
    }
    setActiveCall(null)
    setIncomingCall(null)
    await signOut(auth)
    setPassword('')
    setMessage('')
    setViewProfileUid(null)
    setShowSettings(false)
    setReelsOpen(false)
    setMobileChatOpen(false)
  }

  function showSettingsNotice(text, isError = false) {
    setSettingsMessage(isError ? '' : text)
    setSettingsError(isError ? text : '')
  }

  async function saveProfile(e) {
    e.preventDefault()
    setSettingsBusy(true)
    showSettingsNotice('')
    try {
      const cleanName = profileName.trim()
      if (!cleanName) throw new Error('Введи ім’я профілю.')

      const cleanPhoto = profilePhoto.trim()
      const cleanAbout = profileAbout.trim()

      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          name: cleanName,
          email: user.email,
          about: cleanAbout,
          photoURL: cleanPhoto,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
      await updateProfile(auth.currentUser, {
        displayName: cleanName,
        photoURL: cleanPhoto || null
      })
      showSettingsNotice('Профіль успішно збережено.')
    } catch (err) {
      showSettingsNotice(err.message || 'Не вдалося зберегти профіль.', true)
    } finally {
      setSettingsBusy(false)
    }
  }

  async function changeUserPassword(e) {
    e.preventDefault()
    setSettingsBusy(true)
    showSettingsNotice('')
    try {
      if (!currentPassword || newPassword.length < 6) {
        throw new Error('Вкажи поточний пароль і новий пароль (не менше 6 символів).')
      }
      await reauthenticateWithCredential(
        auth.currentUser,
        EmailAuthProvider.credential(user.email, currentPassword)
      )
      await updatePassword(auth.currentUser, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      showSettingsNotice('Пароль успішно змінено.')
    } catch (err) {
      const msg =
        err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
          ? 'Поточний пароль неправильний.'
          : err.message
      showSettingsNotice(msg || 'Не вдалося змінити пароль.', true)
    } finally {
      setSettingsBusy(false)
    }
  }

  async function resetUserPassword() {
    try {
      await sendPasswordResetEmail(auth, user.email)
      showSettingsNotice(`Лист надіслано на ${user.email}.`)
    } catch (err) {
      showSettingsNotice(err.message || 'Не вдалося надіслати лист.', true)
    }
  }

  async function removeAccount() {
    if (!window.confirm('Точно видалити акаунт? Повідомлення та завантажені файли можуть залишитися.')) {
      return
    }
    const pass = window.prompt('Введи поточний пароль:')
    if (!pass) return
    setSettingsBusy(true)
    try {
      await reauthenticateWithCredential(
        auth.currentUser,
        EmailAuthProvider.credential(user.email, pass)
      )
      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(auth.currentUser)
      setShowSettings(false)
      setMobileChatOpen(false)
    } catch (err) {
      showSettingsNotice(err.message || 'Не вдалося видалити акаунт.', true)
    } finally {
      setSettingsBusy(false)
    }
  }

  async function toggleBrowserNotifications(value) {
    if (value && 'Notification' in window && Notification.permission !== 'granted') {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        return showSettingsNotice('Дозвіл на сповіщення не надано.', true)
      }
    }
    setNotificationsEnabled(value)
    localStorage.setItem('novaNotifications', String(value))
    showSettingsNotice(value ? 'Сповіщення увімкнено.' : 'Сповіщення вимкнено.')
  }

  function playSendSound() {
    if (!soundEnabled) return
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      const ctx = new Ctx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 660
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
      osc.onended = () => ctx.close()
    } catch (err) {
      console.error(err)
    }
  }

  async function findUsers(e) {
    e.preventDefault()
    setSearchError('')
    setSearchResults([])
    const value = search.trim().toLowerCase()
    if (!value) return setSearchError('Введи електронну пошту користувача.')

    setSearching(true)
    try {
      const result = await getDocs(query(collection(db, 'users'), where('email', '==', value)))
      const found = result.docs.map(d => d.data()).filter(x => x.uid !== user.uid)
      setSearchResults(found)
      if (!found.length) setSearchError('Користувача не знайдено.')
    } catch (err) {
      console.error(err)
      setSearchError('Помилка пошуку. Перевір правила Firestore.')
    } finally {
      setSearching(false)
    }
  }

  function showUserProfile(uid) {
    if (!uid || uid === user.uid) {
      setShowSettings(true)
      setSettingsTab('profile')
      setViewProfileUid(null)
      setReelsOpen(false)
      setMobileChatOpen(true)
      return
    }
    setViewProfileUid(uid)
    setShowSettings(false)
    setShowSearch(false)
    setShowChatMenu(false)
    setReelsOpen(false)
    setMobileChatOpen(true)
  }

  async function openChat(otherUser) {
    try {
      const participants = [user.uid, otherUser.uid].sort()
      const chatId = participants.join('_')
      await setDoc(
        doc(db, 'chats', chatId),
        {
          participants,
          isGroup: false,
          participantNames: {
            [user.uid]: profileName || user.displayName || 'Користувач',
            [otherUser.uid]: otherUser.name || 'Користувач'
          },
          lastMessage: '',
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
      setActiveId(chatId)
      setViewProfileUid(null)
      setShowSearch(false)
      setSearch('')
      setSearchResults([])
      setSearchError('')
      setShowSettings(false)
      setShowChatMenu(false)
      setReelsOpen(false)
      setMobileChatOpen(true)
    } catch (err) {
      console.error(err)
      setSearchError('Не вдалося створити чат. Перевір правила Firestore.')
    }
  }

  async function createGroup() {
    setSearchError('')
    const emails = groupEmails
      .split(/[,\n;\s]+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean)

    if (!groupName.trim() || !emails.length) {
      return setSearchError('Вкажи назву групи та email учасників.')
    }

    setSearching(true)
    try {
      const found = await Promise.all(
        emails.map(async mail => {
          const snap = await getDocs(query(collection(db, 'users'), where('email', '==', mail)))
          return snap.docs[0]?.data()
        })
      )

      const me = profiles[user.uid] || {
        uid: user.uid,
        name: profileName || user.displayName || 'Користувач'
      }
      const members = [...new Map([me, ...found.filter(Boolean)].map(x => [x.uid, x])).values()]

      if (members.length < 2) {
        throw new Error('Не знайдено інших користувачів. Перевір email.')
      }

      const participants = members.map(x => x.uid).sort()
      const names = Object.fromEntries(members.map(x => [x.uid, x.name || 'Користувач']))

      const chatRef = await addDoc(collection(db, 'chats'), {
        participants,
        participantNames: names,
        isGroup: true,
        name: groupName.trim(),
        createdBy: user.uid,
        lastMessage: 'Групу створено',
        updatedAt: serverTimestamp()
      })

      setActiveId(chatRef.id)
      setShowGroupCreator(false)
      setGroupName('')
      setGroupEmails('')
      setShowSettings(false)
      setReelsOpen(false)
      setMobileChatOpen(true)
    } catch (err) {
      setSearchError(err.message || 'Не вдалося створити групу.')
    } finally {
      setSearching(false)
    }
  }

  async function setTyping(value) {
    if (!user || !activeId) return
    try {
      await setDoc(
        doc(db, 'chats', activeId, 'typing', user.uid),
        {
          typing: value,
          updatedAt: serverTimestamp(),
          name: profileName || user.displayName || 'Користувач'
        },
        { merge: true }
      )
    } catch (err) {
      console.error(err)
    }
  }

  function handleMessageChange(value) {
    setMessage(value)
    if (!value.trim()) {
      typingActiveRef.current = false
      clearTimeout(typingTimeoutRef.current)
      setTyping(false)
      return
    }
    if (!typingActiveRef.current) {
      typingActiveRef.current = true
      setTyping(true)
    }
    clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false
      setTyping(false)
    }, 1800)
  }

  async function sendMessage(e) {
    e?.preventDefault()
    const text = message.trim()
    if (!text || !activeId || !user) return

    setMessage('')
    const currentReply = replyTo
    setReplyTo(null)
    typingActiveRef.current = false
    clearTimeout(typingTimeoutRef.current)
    setTyping(false)

    try {
      await addDoc(collection(db, 'chats', activeId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: profileName || user.displayName || 'Користувач',
        read: false,
        createdAt: serverTimestamp(),
        ...(currentReply
          ? {
              replyTo: {
                id: currentReply.id,
                text: currentReply.text || 'Вкладення',
                senderName: currentReply.senderName || 'Користувач'
              }
            }
          : {})
      })
      playSendSound()
      await setDoc(
        doc(db, 'chats', activeId),
        { lastMessage: text, updatedAt: serverTimestamp() },
        { merge: true }
      )
    } catch (err) {
      console.error(err)
      setMessage(text)
      setReplyTo(currentReply)
      setError('Повідомлення не надіслано. Спробуй ще раз.')
    }
  }

  async function togglePinMessage(msg) {
    if (!activeId || !activeChat) return
    const isSamePinned = activeChat.pinnedMessage?.id === msg.id
    const nextPinned = isSamePinned
      ? null
      : {
          id: msg.id,
          text: msg.text || (msg.type === 'audio' ? '🎤 Голосове повідомлення' : '📎 Вкладення'),
          senderName: msg.senderName || 'Користувач'
        }
    await updateDoc(doc(db, 'chats', activeId), { pinnedMessage: nextPinned }).catch(() =>
      setError('Не вдалося оновити закріплене повідомлення.')
    )
  }

  async function uploadChatFile(file, kind = 'file') {
    if (!file || !activeId) return
    if (file.size > 25 * 1024 * 1024) {
      return setError('Максимальний розмір файлу — 25 МБ.')
    }

    setUploading(true)
    setError('')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `chatUploads/${activeId}/${user.uid}/${Date.now()}_${safeName}`
      const url = await uploadToSupabase(path, file, file.type)
      const type = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : kind

      await addDoc(collection(db, 'chats', activeId, 'messages'), {
        type,
        text: '',
        fileUrl: url,
        fileName: file.name,
        senderId: user.uid,
        senderName: profileName || user.displayName || 'Користувач',
        read: false,
        createdAt: serverTimestamp()
      })
      playSendSound()

      const previewText =
        type === 'image' ? '📷 Фото' : type === 'video' ? '🎬 Відео' : '📎 Файл'
      await setDoc(
        doc(db, 'chats', activeId),
        { lastMessage: previewText, updatedAt: serverTimestamp() },
        { merge: true }
      )
    } catch (err) {
      console.error(err)
      setError(`Не вдалося завантажити файл: ${err.message || 'перевір Supabase Storage.'}`)
    } finally {
      setUploading(false)
    }
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return setError('Запис голосових повідомлень не підтримується цим пристроєм.')
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      audioChunksRef.current = []
      setRecordingSec(0)

      recordTimerRef.current = window.setInterval(() => {
        setRecordingSec(s => s + 1)
      }, 1000)

      recorder.ondataavailable = e => {
        if (e.data.size) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        clearInterval(recordTimerRef.current)
        stream.getTracks().forEach(t => t.stop())

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm'
        })
        if (!blob.size) {
          setRecording(false)
          return
        }

        setUploading(true)
        try {
          const path = `voice/${activeId}/${user.uid}/${Date.now()}.webm`
          const url = await uploadToSupabase(path, blob, recorder.mimeType || 'audio/webm')
          await addDoc(collection(db, 'chats', activeId, 'messages'), {
            type: 'audio',
            fileUrl: url,
            senderId: user.uid,
            senderName: profileName || user.displayName || 'Користувач',
            read: false,
            createdAt: serverTimestamp()
          })
          playSendSound()
          await setDoc(
            doc(db, 'chats', activeId),
            { lastMessage: '🎤 Голосове повідомлення', updatedAt: serverTimestamp() },
            { merge: true }
          )
        } catch (err) {
          console.error(err)
          setError(`Не вдалося надіслати голосове повідомлення: ${err.message || ''}`)
        } finally {
          setUploading(false)
          setRecording(false)
          setRecordingSec(0)
        }
      }

      recorder.start()
      setRecording(true)
    } catch (err) {
      console.error(err)
      setError('Надай дозвіл на використання мікрофона.')
    }
  }

  function stopRecording() {
    clearInterval(recordTimerRef.current)
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }

  async function reactToMessage(msg, emoji) {
    const reactions = { ...(msg.reactions || {}) }
    const users = [...(reactions[emoji] || [])]
    reactions[emoji] = users.includes(user.uid)
      ? users.filter(x => x !== user.uid)
      : [...users, user.uid]
    if (!reactions[emoji].length) delete reactions[emoji]

    await updateDoc(doc(db, 'chats', activeId, 'messages', msg.id), { reactions }).catch(() =>
      setError('Не вдалося зберегти реакцію.')
    )
    setShowEmojiFor(null)
  }

  async function editMessage(msg, value) {
    const text = value.trim()
    if (!text) return
    await updateDoc(doc(db, 'chats', activeId, 'messages', msg.id), {
      text,
      edited: true,
      editedAt: serverTimestamp()
    })
    setEditingMessage(null)
  }

  async function deleteMessage(msg) {
    if (!window.confirm('Видалити це повідомлення?')) return
    await deleteDoc(doc(db, 'chats', activeId, 'messages', msg.id)).catch(() =>
      setError('Не вдалося видалити повідомлення.')
    )
  }

  async function uploadStory(file) {
    if (!file) return
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      return setError('Історія має бути фото або відео.')
    }
    if (file.size > 50 * 1024 * 1024) {
      return setError('Максимальний розмір історії — 50 МБ.')
    }

    setUploading(true)
    setError('')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `stories/${user.uid}/${Date.now()}_${safeName}`
      const url = await uploadToSupabase(path, file, file.type)
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

      await addDoc(collection(db, 'stories'), {
        uid: user.uid,
        userName: profileName || user.displayName || 'Користувач',
        photoURL: profilePhoto || '',
        mediaUrl: url,
        mediaType: file.type.startsWith('video/') ? 'video' : 'image',
        storagePath: path,
        createdAt: serverTimestamp(),
        expiresAt: expires
      })
    } catch (err) {
      console.error(err)
      setError(`Не вдалося опублікувати історію: ${err.message || 'перевір Supabase Storage.'}`)
    } finally {
      setUploading(false)
    }
  }

  async function sendStoryHeart(storyItem) {
    if (!storyItem || storyItem.uid === user.uid) return
    try {
      const participants = [user.uid, storyItem.uid].sort()
      const chatId = participants.join('_')
      const myName = profileName || user.displayName || 'Користувач'
      const peerName = profiles[storyItem.uid]?.name || storyItem.userName || 'Користувач'

      await setDoc(
        doc(db, 'chats', chatId),
        {
          participants,
          isGroup: false,
          participantNames: { [user.uid]: myName, [storyItem.uid]: peerName },
          lastMessage: '❤️ Відповів(ла) на вашу історію',
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
      await addDoc(collection(db, 'chats', chatId, 'messages'), {
        text: '❤️ Відповів(ла) на вашу історію',
        senderId: user.uid,
        senderName: myName,
        read: false,
        createdAt: serverTimestamp()
      })
      playSendSound()
      setError('❤️ Реакцію надіслано в чат!')
    } catch (err) {
      console.error(err)
      setError('Не вдалося надіслати реакцію на історію.')
    }
  }

  async function deleteStory(storyItem) {
    if (!storyItem || storyItem.uid !== user.uid) return
    if (!window.confirm('Видалити цю історію?')) return
    try {
      await deleteDoc(doc(db, 'stories', storyItem.id))
      setStoryViewer(prev => {
        if (!prev) return null
        const remaining = prev.items.filter(s => s.id !== storyItem.id)
        if (!remaining.length) return null
        return {
          ...prev,
          items: remaining,
          activeIndex: Math.min(prev.activeIndex, remaining.length - 1)
        }
      })
    } catch (err) {
      console.error(err)
      setError('Не вдалося видалити історію.')
    }
  }

  async function uploadReel(file) {
    if (!file) return
    if (!file.type.startsWith('video/')) {
      return setError('Для кліпу обери відеофайл.')
    }
    if (file.size > 50 * 1024 * 1024) {
      return setError('Максимальний розмір кліпу — 50 МБ.')
    }

    setUploading(true)
    setError('')
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `reels/${user.uid}/${Date.now()}_${safeName}`
      const url = await uploadToSupabase(path, file, file.type)
      await addDoc(collection(db, 'reels'), {
        uid: user.uid,
        userName: profileName || user.displayName || 'Користувач',
        photoURL: profilePhoto || '',
        videoUrl: url,
        caption: reelCaption.trim(),
        likes: [],
        createdAt: serverTimestamp()
      })
      setReelCaption('')
      setReelIndex(0)
    } catch (err) {
      console.error(err)
      setError(`Не вдалося опублікувати кліп: ${err.message || 'перевір Supabase Storage.'}`)
    } finally {
      setUploading(false)
    }
  }

  async function toggleReelLike(reel) {
    if (!reel?.id) return
    const currentLikes = Array.isArray(reel.likes) ? reel.likes : []
    const nextLikes = currentLikes.includes(user.uid)
      ? currentLikes.filter(uid => uid !== user.uid)
      : [...currentLikes, user.uid]

    await updateDoc(doc(db, 'reels', reel.id), { likes: nextLikes }).catch(() =>
      setError('Не вдалося оновити лайк.')
    )
  }

  async function addReelComment(e) {
    e.preventDefault()
    if (!currentReel?.id || !reelCommentText.trim()) return
    const text = reelCommentText.trim()
    setReelCommentText('')
    try {
      await addDoc(collection(db, 'reels', currentReel.id, 'comments'), {
        uid: user.uid,
        userName: profileName || user.displayName || 'Користувач',
        text,
        createdAt: serverTimestamp()
      })
    } catch (err) {
      console.error(err)
      setError('Не вдалося додати коментар.')
    }
  }

  async function createCall(type) {
    if (!activeId || !activeChat || activeChat.isGroup || !otherUid) {
      return setError('Дзвінки в групових чатах поки не підтримуються.')
    }
    if (activeCall || incomingCall) {
      return setError('Спочатку заверши поточний дзвінок.')
    }

    try {
      const callRef = await addDoc(collection(db, 'calls'), {
        createdBy: user.uid,
        participants: [user.uid, otherUid],
        type,
        status: 'ringing',
        chatId: activeId,
        callerName: profileName || user.displayName || 'Користувач',
        recipientName: activeName,
        createdAt: serverTimestamp()
      })
      setActiveCall({
        id: callRef.id,
        peerId: otherUid,
        peerName: activeName,
        type,
        isCaller: true
      })
    } catch (err) {
      console.error(err)
      setError(`Помилка дзвінка: ${err.message}`)
    }
  }

  async function acceptCall() {
    if (!incomingCall) return
    const call = incomingCall
    const callerId = call.createdBy
    try {
      await updateDoc(doc(db, 'calls', call.id), {
        status: 'accepted',
        acceptedAt: serverTimestamp()
      })
      setActiveCall({
        id: call.id,
        peerId: callerId,
        peerName: profiles[callerId]?.name || call.callerName || 'Користувач',
        type: call.type,
        isCaller: false
      })
      setIncomingCall(null)
    } catch (err) {
      console.error(err)
      setError('Не вдалося прийняти дзвінок.')
    }
  }

  async function declineCall() {
    if (!incomingCall) return
    const id = incomingCall.id
    setIncomingCall(null)
    await updateDoc(doc(db, 'calls', id), {
      status: 'ended',
      endedAt: serverTimestamp()
    }).catch(console.error)
  }

  const allStories = useMemo(() => {
    const active = stories.filter(s => !isExpired(s))
    const byUser = new Map()
    active.forEach(s => {
      const list = byUser.get(s.uid) || []
      list.push(s)
      byUser.set(s.uid, list)
    })

    return [...byUser.entries()].map(([uid, items]) => {
      const sorted = [...items].sort(
        (a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)
      )
      return {
        uid,
        items: sorted,
        activeIndex: sorted.length - 1
      }
    })
  }, [stories])

  if (loading) {
    return <div className="auth-loading">Завантаження NovaChat...</div>
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-icon">N</div>
            <span>
              Nova<span className="logo-light">Chat</span>
            </span>
          </div>

          <h1>{mode === 'login' ? 'З поверненням!' : 'Створи акаунт'}</h1>
          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Увійди, щоб продовжити спілкування'
              : 'Приєднуйся до NovaChat'}
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            {mode === 'register' && (
              <label>
                Твоє ім’я
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Наприклад, Ігор"
                />
              </label>
            )}

            <label>
              Електронна пошта
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>

            <label>
              Пароль
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Мінімум 6 символів"
              />
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button className="auth-submit" disabled={busy}>
              {busy ? 'Зачекай...' : mode === 'login' ? 'Увійти' : 'Створити акаунт'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login' ? 'Ще не маєш акаунта?' : 'Вже маєш акаунт?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login')
                setError('')
              }}
            >
              {mode === 'login' ? 'Зареєструватися' : 'Увійти'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentStoryItem = storyViewer
    ? storyViewer.items[storyViewer.activeIndex] || storyViewer.items[0]
    : null

  return (
    <div className={`app ${mobileChatOpen ? 'mobile-chat-open' : ''}`}>
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">N</div>
          <span>
            Nova<span className="logo-light">Chat</span>
          </span>
        </div>

        <div className="stories-strip">
          <button
            type="button"
            className="story-add"
            onClick={() => storyInputRef.current?.click()}
            disabled={uploading}
          >
            <div className="story-ring story-ring-add">
              <Avatar photoURL={profiles[user.uid]?.photoURL || profilePhoto} fallback="＋" />
            </div>
            <small>Сторіз</small>
          </button>

          {allStories
            .filter(s => s.uid !== user.uid)
            .map(item => {
              const latest = item.items[item.items.length - 1]
              return (
                <button
                  type="button"
                  key={item.uid}
                  className="story-person"
                  onClick={() => setStoryViewer(item)}
                >
                  <div className="story-ring">
                    <Avatar
                      photoURL={latest.photoURL || profiles[item.uid]?.photoURL}
                      fallback={initials(latest.userName)}
                    />
                  </div>
                  <small>{latest.userName || profiles[item.uid]?.name || 'Користувач'}</small>
                </button>
              )
            })}

          {allStories.some(s => s.uid === user.uid) && (
            <button
              type="button"
              className="story-person"
              onClick={() => setStoryViewer(allStories.find(s => s.uid === user.uid))}
            >
              <div className="story-ring story-ring-mine">
                <Avatar photoURL={profilePhoto} fallback="🧑🏻" />
              </div>
              <small>Моя історія</small>
            </button>
          )}

          <input
            ref={storyInputRef}
            hidden
            type="file"
            accept="image/*,video/*"
            onChange={e => {
              uploadStory(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>

        <div className="sidebar-title">
          <span>ПОВІДОМЛЕННЯ</span>
          <button
            type="button"
            className="add-button"
            title="Новий чат"
            onClick={() => {
              setViewProfileUid(null)
              setShowGroupCreator(false)
              setShowSearch(v => !v)
            }}
          >
            ＋
          </button>
        </div>

        <div className="sidebar-tools">
          <button
            type="button"
            className="tool-chip"
            onClick={() => {
              setShowSearch(false)
              setShowGroupCreator(v => !v)
            }}
          >
            👥 Група
          </button>
          <button
            type="button"
            className={`tool-chip ${reelsOpen ? 'active-chip' : ''}`}
            onClick={() => {
              setReelsOpen(v => !v)
              setShowSettings(false)
              setViewProfileUid(null)
              setMobileChatOpen(true)
            }}
          >
            🎬 Кліпи
          </button>
        </div>

        <div className="chat-filter-tabs">
          {[
            ['all', 'Усі'],
            ['direct', 'Особисті'],
            ['groups', 'Групи']
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={chatFilter === key ? 'active' : ''}
              onClick={() => setChatFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {showGroupCreator && (
          <div className="group-creator">
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="Назва групи"
            />
            <textarea
              value={groupEmails}
              onChange={e => setGroupEmails(e.target.value)}
              placeholder="Email учасників через кому або пробіл"
              rows="2"
            />
            <button
              type="button"
              className="auth-submit"
              onClick={createGroup}
              disabled={searching}
            >
              {searching ? 'Створення...' : 'Створити групу'}
            </button>
          </div>
        )}

        {showSearch && (
          <div className="new-chat">
            <form onSubmit={findUsers}>
              <input
                className="search"
                placeholder="Email користувача..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className="auth-submit" disabled={searching}>
                {searching ? 'Пошук...' : 'Знайти'}
              </button>
            </form>

            {searchError && <p className="auth-error">{searchError}</p>}

            {searchResults.map(item => {
              const p = profiles[item.uid] || item
              return (
                <div key={item.uid} className="chat-item search-user">
                  <button
                    type="button"
                    className="avatar-button"
                    onClick={() => showUserProfile(item.uid)}
                  >
                    <Avatar photoURL={p.photoURL} />
                  </button>
                  <button
                    type="button"
                    className="chat-info profile-link"
                    onClick={() => showUserProfile(item.uid)}
                  >
                    <strong>{p.name || 'Користувач'}</strong>
                    <span>{p.email}</span>
                  </button>
                  <button
                    type="button"
                    className="write-user-button"
                    onClick={() => openChat(p)}
                  >
                    Написати
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="chat-list">
          {filteredChats.map(chat => {
            const peer = (chat.participants || []).find(uid => uid !== user.uid)
            const p = profiles[peer] || {}
            const title = chat.isGroup
              ? chat.name || 'Груповий чат'
              : p.name || chat.participantNames?.[peer] || 'Користувач'
            const online = !chat.isGroup && Boolean(p.isOnline)

            return (
              <button
                type="button"
                key={chat.id}
                className={`chat-item ${activeId === chat.id && !showSettings && !viewProfileUid && !reelsOpen ? 'active' : ''}`}
                onClick={() => {
                  setActiveId(chat.id)
                  setViewProfileUid(null)
                  setShowSettings(false)
                  setShowChatMenu(false)
                  setReelsOpen(false)
                  setMobileChatOpen(true)
                }}
              >
                <span className="avatar-wrap">
                  <Avatar
                    photoURL={chat.isGroup ? '' : p.photoURL}
                    fallback={chat.isGroup ? '👥' : '👤'}
                  />
                  {online && <i className="online-dot" title="У мережі" />}
                </span>
                <span className="chat-info">
                  <strong>{title}</strong>
                  <span>{chat.lastMessage || 'Почни спілкування'}</span>
                </span>
              </button>
            )
          })}

          {!filteredChats.length && (
            <p className="auth-subtitle">
              Чатів у цій категорії немає. Натисни ＋, щоб знайти користувача.
            </p>
          )}
        </div>

        <div className="profile">
          <button
            type="button"
            className="avatar-button"
            onClick={() => {
              setShowSettings(true)
              setSettingsTab('profile')
              setViewProfileUid(null)
              setReelsOpen(false)
              setMobileChatOpen(true)
            }}
          >
            <Avatar
              className="avatar profile-avatar"
              photoURL={profiles[user.uid]?.photoURL || profilePhoto}
              fallback="🧑🏻"
            />
          </button>
          <div className="profile-info">
            <strong>
              {profiles[user.uid]?.name || profileName || user.displayName || 'Користувач'}
            </strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            className="profile-menu"
            onClick={() => {
              setShowSettings(true)
              setViewProfileUid(null)
              setSettingsTab('profile')
              setReelsOpen(false)
              setMobileChatOpen(true)
              showSettingsNotice('')
            }}
          >
            ⚙ Меню
          </button>
        </div>
      </aside>

      <main className="main">
        {reelsOpen ? (
          <section className="reels-page">
            <header className="reels-header">
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => {
                  setReelsOpen(false)
                  setMobileChatOpen(false)
                }}
                aria-label="Назад до чатів"
              >
                ←
              </button>
              <h2>🎬 Кліпи</h2>
              <button
                type="button"
                className="tool-chip"
                onClick={() => reelInputRef.current?.click()}
                disabled={uploading}
              >
                ＋ Завантажити кліп
              </button>
              <input
                ref={reelInputRef}
                hidden
                type="file"
                accept="video/*"
                onChange={e => {
                  uploadReel(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </header>

            <div className="reel-upload-caption">
              <input
                value={reelCaption}
                onChange={e => setReelCaption(e.target.value)}
                placeholder="Підпис до нового кліпу (необов'язково)..."
              />
            </div>

            {currentReel ? (
              <div className="reel-stage">
                <div className="reel-video-box">
                  <video
                    key={currentReel.id}
                    src={currentReel.videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                  <div className="reel-overlay-info">
                    <strong>@{currentReel.userName || 'Користувач'}</strong>
                    {currentReel.caption && <p>{currentReel.caption}</p>}
                  </div>
                </div>

                <div className="reel-sidebar-actions">
                  <button
                    type="button"
                    className={`reel-action-btn ${(currentReel.likes || []).includes(user.uid) ? 'liked' : ''}`}
                    onClick={() => toggleReelLike(currentReel)}
                  >
                    ❤️ <span>{(currentReel.likes || []).length}</span>
                  </button>

                  <button
                    type="button"
                    className="reel-action-btn"
                    disabled={reelIndex === 0}
                    onClick={() => setReelIndex(i => Math.max(0, i - 1))}
                  >
                    ↑ <span>Вгору</span>
                  </button>

                  <button
                    type="button"
                    className="reel-action-btn"
                    disabled={reelIndex >= reels.length - 1}
                    onClick={() => setReelIndex(i => Math.min(reels.length - 1, i + 1))}
                  >
                    ↓ <span>Далі</span>
                  </button>
                </div>

                <div className="reel-comments-box">
                  <h3>Коментарі ({reelComments.length})</h3>
                  <div className="reel-comments-list">
                    {reelComments.map(c => (
                      <div key={c.id} className="reel-comment-item">
                        <b>{c.userName}:</b> <span>{c.text}</span>
                      </div>
                    ))}
                    {!reelComments.length && (
                      <p className="settings-muted">Будь першим, хто прокоментує кліп.</p>
                    )}
                  </div>

                  <form className="reel-comment-form" onSubmit={addReelComment}>
                    <input
                      value={reelCommentText}
                      onChange={e => setReelCommentText(e.target.value)}
                      placeholder="Написати коментар..."
                    />
                    <button type="submit" disabled={!reelCommentText.trim()}>
                      ➤
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="empty-chat">
                <h2>Кліпів поки немає</h2>
                <p>Завантаж перше коротке відео кнопкою «＋ Завантажити кліп».</p>
              </div>
            )}
          </section>
        ) : showSettings ? (
          <section className="settings-page">
            <header className="settings-header">
              <div>
                <h1>Налаштування</h1>
                <p>Керуй профілем та параметрами NovaChat</p>
              </div>
              <button
                type="button"
                className="header-button"
                onClick={() => {
                  setShowSettings(false)
                  setMobileChatOpen(false)
                }}
              >
                ✕
              </button>
            </header>

            <div className="settings-layout">
              <nav className="settings-nav">
                {[
                  ['profile', '👤 Профіль'],
                  ['security', '🔒 Безпека'],
                  ['notifications', '🔔 Сповіщення'],
                  ['appearance', '🎨 Тема'],
                  ['language', '🌐 Мова']
                ].map(([tab, label]) => (
                  <button
                    type="button"
                    key={tab}
                    className={settingsTab === tab ? 'selected' : ''}
                    onClick={() => {
                      setSettingsTab(tab)
                      showSettingsNotice('')
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="settings-content">
                {settingsTab === 'profile' && (
                  <form className="settings-form" onSubmit={saveProfile}>
                    <h2>Профіль</h2>
                    <div className="settings-avatar">
                      {profilePhoto ? <img src={profilePhoto} alt="Фото профілю" /> : '🧑🏻'}
                    </div>
                    <label>
                      Ім’я
                      <input
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        maxLength={40}
                      />
                    </label>
                    <label>
                      Фото профілю (посилання)
                      <input
                        value={profilePhoto}
                        onChange={e => setProfilePhoto(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                    <label>
                      Про себе
                      <textarea
                        value={profileAbout}
                        onChange={e => setProfileAbout(e.target.value)}
                        rows="4"
                        maxLength={250}
                      />
                    </label>
                    <label>
                      Електронна пошта
                      <input value={user.email || ''} readOnly />
                    </label>
                    <button className="auth-submit" disabled={settingsBusy}>
                      {settingsBusy ? 'Збереження...' : 'Зберегти профіль'}
                    </button>
                  </form>
                )}

                {settingsTab === 'security' && (
                  <div className="settings-form">
                    <h2>Безпека</h2>
                    <p className="settings-muted">Зміна пароля для {user.email}</p>
                    <form onSubmit={changeUserPassword}>
                      <label>
                        Поточний пароль
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                        />
                      </label>
                      <label>
                        Новий пароль
                        <input
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                        />
                      </label>
                      <button className="auth-submit" disabled={settingsBusy}>
                        Змінити пароль
                      </button>
                    </form>
                    <button
                      type="button"
                      className="secondary-settings-button"
                      onClick={resetUserPassword}
                    >
                      Надіслати лист для відновлення пароля
                    </button>
                    <button
                      type="button"
                      className="secondary-settings-button"
                      onClick={handleLogout}
                    >
                      Вийти з акаунта
                    </button>
                    <button
                      type="button"
                      className="danger-settings-button"
                      onClick={removeAccount}
                    >
                      Видалити акаунт
                    </button>
                  </div>
                )}

                {settingsTab === 'notifications' && (
                  <div className="settings-form">
                    <h2>Сповіщення</h2>
                    <label className="settings-toggle">
                      <span>
                        <strong>Звук повідомлень</strong>
                        <small>Короткий звук після надсилання</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={e => {
                          setSoundEnabled(e.target.checked)
                          localStorage.setItem('novaSound', String(e.target.checked))
                        }}
                      />
                    </label>
                    <label className="settings-toggle">
                      <span>
                        <strong>Сповіщення браузера</strong>
                        <small>Дозвіл на показ сповіщень про нові повідомлення</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={notificationsEnabled}
                        onChange={e => toggleBrowserNotifications(e.target.checked)}
                      />
                    </label>
                  </div>
                )}

                {settingsTab === 'appearance' && (
                  <div className="settings-form">
                    <h2>Зовнішній вигляд</h2>
                    <div className="theme-options">
                      <button
                        type="button"
                        className={`theme-choice ${theme === 'dark' ? 'selected' : ''}`}
                        onClick={() => setTheme('dark')}
                      >
                        🌙 Темна
                      </button>
                      <button
                        type="button"
                        className={`theme-choice ${theme === 'light' ? 'selected' : ''}`}
                        onClick={() => setTheme('light')}
                      >
                        ☀️ Світла
                      </button>
                    </div>
                  </div>
                )}

                {settingsTab === 'language' && (
                  <div className="settings-form">
                    <h2>Мова</h2>
                    <label>
                      Мова інтерфейсу
                      <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                      >
                        <option value="uk">Українська</option>
                        <option value="en">English</option>
                      </select>
                    </label>
                  </div>
                )}

                {settingsMessage && <div className="settings-success">{settingsMessage}</div>}
                {settingsError && <div className="auth-error">{settingsError}</div>}
              </div>
            </div>
          </section>
        ) : viewProfileUid ? (
          <section className="user-profile-page">
            <header className="user-profile-header">
              <button
                type="button"
                className="header-button"
                onClick={() => {
                  setViewProfileUid(null)
                  setMobileChatOpen(false)
                }}
              >
                ← Назад
              </button>
              <h2>Профіль користувача</h2>
            </header>

            <div className="user-profile-card">
              <Avatar className="user-profile-avatar" photoURL={viewedProfile.photoURL} />
              <h1>{viewedProfile.name || 'Користувач'}</h1>
              <p className="user-profile-email">{viewedProfile.email}</p>
              <p className="presence-text">
                {viewedProfile.isOnline
                  ? '🟢 У мережі'
                  : `Був(ла) у мережі: ${lastSeenText(viewedProfile.lastSeen)}`}
              </p>
              <div className="user-profile-about">
                <h3>Про себе</h3>
                <p>
                  {viewedProfile.about || 'Користувач ще нічого не розповів про себе.'}
                </p>
              </div>
              <button
                type="button"
                className="auth-submit user-profile-message"
                onClick={() =>
                  openChat({
                    uid: viewProfileUid,
                    name: viewedProfile.name || 'Користувач'
                  })
                }
              >
                ✉ Написати повідомлення
              </button>
            </div>
          </section>
        ) : activeChat ? (
          <>
            <header className="chat-header">
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => setMobileChatOpen(false)}
                aria-label="Назад до чатів"
              >
                ←
              </button>

              <button
                type="button"
                className="chat-header-profile"
                onClick={() =>
                  activeChat.isGroup ? setShowChatMenu(v => !v) : showUserProfile(otherUid)
                }
              >
                <Avatar
                  photoURL={activeProfile.photoURL}
                  fallback={activeChat.isGroup ? '👥' : '👤'}
                />
                <span className="header-info">
                  <strong>{activeName}</strong>
                  <span className={activeProfile.isOnline ? 'status-online' : 'status-offline'}>
                    {activeChat.isGroup
                      ? `${participantIds.length} учасників`
                      : activeProfile.isOnline
                        ? '🟢 У мережі'
                        : `Був(ла) ${lastSeenText(activeProfile.lastSeen)}`}
                  </span>
                </span>
              </button>

              <div className="chat-call-actions">
                <button
                  type="button"
                  className="header-button"
                  onClick={() => {
                    setChatSearchOpen(v => !v)
                    setChatSearchQuery('')
                  }}
                  title="Пошук у чаті"
                >
                  🔍
                </button>
                {!activeChat.isGroup && (
                  <>
                    <button
                      type="button"
                      className="header-button"
                      onClick={() => createCall('audio')}
                      disabled={!!activeCall || !!incomingCall}
                      title="Аудіодзвінок"
                    >
                      📞
                    </button>
                    <button
                      type="button"
                      className="header-button"
                      onClick={() => createCall('video')}
                      disabled={!!activeCall || !!incomingCall}
                      title="Відеодзвінок"
                    >
                      🎥
                    </button>
                  </>
                )}
              </div>
            </header>

            {chatSearchOpen && (
              <div className="chat-search-bar">
                <input
                  value={chatSearchQuery}
                  onChange={e => setChatSearchQuery(e.target.value)}
                  placeholder="Пошук у повідомленнях чату..."
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    setChatSearchOpen(false)
                    setChatSearchQuery('')
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            {activeChat.pinnedMessage && (
              <div className="pinned-banner">
                <span>
                  📌 <b>{activeChat.pinnedMessage.senderName}:</b> {activeChat.pinnedMessage.text}
                </span>
                <button
                  type="button"
                  onClick={() => togglePinMessage(activeChat.pinnedMessage)}
                  title="Відкріпити"
                >
                  ✕
                </button>
              </div>
            )}

            {showChatMenu && activeChat.isGroup && (
              <div className="group-info-panel">
                <div className="group-info-head">
                  <strong>{activeChat.name}</strong>
                  <button type="button" onClick={() => setShowChatMenu(false)}>
                    ✕
                  </button>
                </div>
                <p>Учасники ({participantIds.length}):</p>
                <div className="group-members-list">
                  {participantIds.map(uid => (
                    <span key={uid} className="group-member-pill">
                      {profiles[uid]?.name || activeChat.participantNames?.[uid] || 'Користувач'}
                      {uid === user.uid ? ' (ви)' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <section className="messages">
              {filteredMessages.map(msg => {
                const mine = msg.senderId === user.uid
                const isEditing = editingMessage?.id === msg.id

                return (
                  <div key={msg.id} className={`message-row ${mine ? 'mine' : ''}`}>
                    <div className="message-bubble">
                      {!mine && activeChat.isGroup && (
                        <strong className="message-sender">{msg.senderName}</strong>
                      )}

                      {msg.replyTo && (
                        <div className="reply-preview">
                          <strong>{msg.replyTo.senderName}</strong>
                          <span>{msg.replyTo.text}</span>
                        </div>
                      )}

                      {isEditing ? (
                        <form
                          className="edit-message-form"
                          onSubmit={e => {
                            e.preventDefault()
                            editMessage(msg, editingMessage.text)
                          }}
                        >
                          <input
                            autoFocus
                            value={editingMessage.text}
                            onChange={e =>
                              setEditingMessage({ ...editingMessage, text: e.target.value })
                            }
                          />
                          <button type="submit">Зберегти</button>
                          <button
                            type="button"
                            onClick={() => setEditingMessage(null)}
                          >
                            Скасувати
                          </button>
                        </form>
                      ) : (
                        <>
                          {msg.type === 'image' && (
                            <a href={msg.fileUrl} target="_blank" rel="noreferrer">
                              <img
                                className="message-media"
                                src={msg.fileUrl}
                                alt="Вкладене фото"
                                loading="lazy"
                              />
                            </a>
                          )}
                          {msg.type === 'video' && (
                            <video
                              className="message-media"
                              src={msg.fileUrl}
                              controls
                              playsInline
                            />
                          )}
                          {msg.type === 'audio' && (
                            <audio
                              className="voice-player"
                              src={msg.fileUrl}
                              controls
                            />
                          )}
                          {msg.type === 'file' && (
                            <a
                              className="file-attachment"
                              href={msg.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              📎 {msg.fileName || 'Завантажити файл'}
                            </a>
                          )}
                          {msg.text && <span className="message-text">{msg.text}</span>}
                          {msg.edited && <small className="edited-label">ред.</small>}
                        </>
                      )}

                      <span className="message-time">
                        {timeText(msg.createdAt)}
                        {mine ? (msg.read ? ' ✓✓' : ' ✓') : ''}
                      </span>

                      <div className="message-actions">
                        <button
                          type="button"
                          title="Відповісти"
                          onClick={() => setReplyTo(msg)}
                        >
                          ↩
                        </button>
                        <button
                          type="button"
                          title="Реакція"
                          onClick={() =>
                            setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id)
                          }
                        >
                          ☺
                        </button>
                        <button
                          type="button"
                          title="Закріпити"
                          onClick={() => togglePinMessage(msg)}
                        >
                          📌
                        </button>
                        {mine && msg.text && (
                          <button
                            type="button"
                            title="Редагувати"
                            onClick={() =>
                              setEditingMessage({ id: msg.id, text: msg.text })
                            }
                          >
                            ✎
                          </button>
                        )}
                        {mine && (
                          <button
                            type="button"
                            title="Видалити"
                            onClick={() => deleteMessage(msg)}
                          >
                            ⌫
                          </button>
                        )}
                      </div>

                      {showEmojiFor === msg.id && (
                        <div className="reaction-picker">
                          {REACTIONS.map(emoji => (
                            <button
                              type="button"
                              key={emoji}
                              onClick={() => reactToMessage(msg, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div className="message-reactions">
                          {Object.entries(msg.reactions).map(([emoji, users]) => (
                            <button
                              type="button"
                              key={emoji}
                              className={users.includes(user.uid) ? 'reacted' : ''}
                              onClick={() => reactToMessage(msg, emoji)}
                            >
                              {emoji} {users.length}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
            </section>

            {typingUsers.length > 0 && (
              <div className="typing-indicator">
                <span>
                  {typingUsers.map(x => x.name || 'Користувач').join(', ')}{' '}
                  {typingUsers.length === 1 ? 'друкує' : 'друкують'}
                </span>
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
            )}

            {replyTo && (
              <div className="reply-compose">
                <span>
                  Відповідь <b>{replyTo.senderName}</b>:{' '}
                  {(replyTo.text || 'Вкладення').slice(0, 70)}
                </span>
                <button type="button" onClick={() => setReplyTo(null)}>
                  ✕
                </button>
              </div>
            )}

            <form className="message-form" onSubmit={sendMessage}>
              <button
                type="button"
                className="attach-button"
                title="Фото, відео або файл"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording}
              >
                ＋
              </button>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={e => {
                  uploadChatFile(e.target.files?.[0])
                  e.target.value = ''
                }}
              />

              <input
                value={message}
                onChange={e => handleMessageChange(e.target.value)}
                placeholder={
                  recording
                    ? `Запис голосового... ${recordingSec}с`
                    : 'Написати повідомлення...'
                }
                disabled={recording}
              />

              <button
                type="button"
                className={`voice-button ${recording ? 'recording' : ''}`}
                onClick={recording ? stopRecording : startRecording}
                disabled={uploading}
                title={recording ? 'Зупинити запис' : 'Записати голосове'}
              >
                {recording ? '■' : '🎤'}
              </button>

              <button
                type="submit"
                className="send-button"
                disabled={!message.trim() || uploading || recording}
              >
                ➤
              </button>
            </form>

            {uploading && <div className="upload-status">Завантаження медіа...</div>}
          </>
        ) : (
          <div className="empty-chat">
            <h2>Ласкаво просимо до NovaChat!</h2>
            <p>Знайди користувача або створи групу, щоб почати спілкування.</p>
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                setShowSearch(true)
                setMobileChatOpen(false)
              }}
            >
              Створити новий чат
            </button>
          </div>
        )}

        {error && (
          <div className="app-error" onClick={() => setError('')}>
            <span>{error}</span>
            <b>✕</b>
          </div>
        )}
      </main>

      {storyViewer && currentStoryItem && (
        <div className="story-viewer" onClick={() => setStoryViewer(null)}>
          <div className="story-viewer-card" onClick={e => e.stopPropagation()}>
            <div className="story-bars">
              {storyViewer.items.map((s, idx) => (
                <div
                  key={s.id}
                  className={`story-bar ${idx <= storyViewer.activeIndex ? 'active' : ''}`}
                  onClick={() =>
                    setStoryViewer(prev => (prev ? { ...prev, activeIndex: idx } : null))
                  }
                />
              ))}
            </div>

            <header className="story-viewer-header">
              <div>
                <strong>
                  {currentStoryItem.userName ||
                    profiles[storyViewer.uid]?.name ||
                    'Історія'}
                </strong>
                <small>{timeText(currentStoryItem.createdAt)} · до 24 год</small>
              </div>
              <div className="story-header-actions">
                {currentStoryItem.uid !== user.uid && (
                  <button
                    type="button"
                    onClick={() => sendStoryHeart(currentStoryItem)}
                    title="Вподобати історію"
                  >
                    ❤️
                  </button>
                )}
                {currentStoryItem.uid === user.uid && (
                  <button
                    type="button"
                    onClick={() => deleteStory(currentStoryItem)}
                    title="Видалити історію"
                  >
                    🗑
                  </button>
                )}
                <button type="button" onClick={() => setStoryViewer(null)}>
                  ✕
                </button>
              </div>
            </header>

            <div className="story-media-box">
              {currentStoryItem.mediaType === 'video' ? (
                <video
                  src={currentStoryItem.mediaUrl}
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img src={currentStoryItem.mediaUrl} alt="Історія" />
              )}
            </div>

            {storyViewer.items.length > 1 && (
              <div className="story-navigation">
                <button
                  type="button"
                  onClick={() =>
                    setStoryViewer(prev => ({
                      ...prev,
                      activeIndex: Math.max(0, prev.activeIndex - 1)
                    }))
                  }
                  disabled={storyViewer.activeIndex === 0}
                >
                  ← Попередня
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStoryViewer(prev => ({
                      ...prev,
                      activeIndex: Math.min(prev.items.length - 1, prev.activeIndex + 1)
                    }))
                  }
                  disabled={storyViewer.activeIndex >= storyViewer.items.length - 1}
                >
                  Наступна →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {incomingCall && !activeCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <h2>
              Вхідний {incomingCall.type === 'video' ? 'відеодзвінок' : 'аудіодзвінок'}
            </h2>
            <p>
              {profiles[incomingCall.createdBy]?.name ||
                incomingCall.callerName ||
                'Користувач'}{' '}
              телефонує тобі
            </p>
            <div className="incoming-call-actions">
              <button type="button" onClick={declineCall}>
                Відхилити
              </button>
              <button type="button" onClick={acceptCall}>
                Прийняти
              </button>
            </div>
          </div>
        </div>
      )}

      {activeCall && (
        <CallWindow
          user={user}
          callId={activeCall.id}
          peerId={activeCall.peerId}
          peerName={activeCall.peerName}
          callType={activeCall.type}
          isCaller={activeCall.isCaller}
          onClose={() => setActiveCall(null)}
        />
      )}
    </div>
  )
}

export default App
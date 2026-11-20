
import { useState, useEffect } from 'react'
import './App.css'
import './Settings.css'
import { auth, db } from './firebase.js'
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
  updateDoc
} from 'firebase/firestore'

function Avatar({ photoURL, className = 'avatar', fallback = '👤' }) {
  return (
    <div className={className}>
      {photoURL
        ? <img src={photoURL} alt="Фото профілю" />
        : fallback}
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Дзвінки
  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)

  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')

  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)

  // Профілі користувачів
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

  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem('novaSound') !== 'false'
  )

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('novaNotifications') === 'true'
  )

  const [theme, setTheme] = useState(
    () => localStorage.getItem('novaTheme') || 'dark'
  )

  const [language, setLanguage] = useState(
    () => localStorage.getItem('novaLanguage') || 'uk'
  )

  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)

  // Перевірка авторизації
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, currentUser => {
      setUser(currentUser)
      setLoading(false)
    })

    return unsubscribe
  }, [])

  // Тема
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('novaTheme', theme)
  }, [theme])

  // Мова
  useEffect(() => {
    localStorage.setItem('novaLanguage', language)
  }, [language])

  // Завантаження власного профілю
  useEffect(() => {
    if (!user) return

    setProfileName(user.displayName || '')
    setProfilePhoto(user.photoURL || '')

    getDoc(doc(db, 'users', user.uid))
      .then(snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data()

          setProfileName(data.name || user.displayName || '')
          setProfileAbout(data.about || '')
          setProfilePhoto(data.photoURL || user.photoURL || '')
        }
      })
      .catch(err => console.error('Profile load:', err))
  }, [user])

  // Підписка на профілі користувачів
  useEffect(() => {
    if (!user) {
      setProfiles({})
      return
    }

    const userIds = new Set([user.uid])

    chats.forEach(chat => {
      chat.participants?.forEach(uid => userIds.add(uid))
    })

    searchResults.forEach(item => {
      if (item.uid) userIds.add(item.uid)
    })

    if (viewProfileUid) {
      userIds.add(viewProfileUid)
    }

    const unsubscribers = []

    userIds.forEach(uid => {
      const unsubscribe = onSnapshot(
        doc(db, 'users', uid),
        snapshot => {
          if (snapshot.exists()) {
            setProfiles(previous => ({
              ...previous,
              [uid]: snapshot.data()
            }))
          } else {
            setProfiles(previous => {
              const updated = { ...previous }
              delete updated[uid]
              return updated
            })
          }
        },
        err => console.error('Profile subscription:', err)
      )

      unsubscribers.push(unsubscribe)
    })

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [user, chats, searchResults, viewProfileUid])

  // Завантаження чатів
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

    const unsubscribe = onSnapshot(q, snapshot => {
      const list = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }))

      list.sort((a, b) => {
        const dateA = a.updatedAt?.toMillis?.() || 0
        const dateB = b.updatedAt?.toMillis?.() || 0
        return dateB - dateA
      })

      setChats(list)

      setActiveId(current => {
        if (current && list.some(chat => chat.id === current)) {
          return current
        }

        return list[0]?.id || null
      })
    }, err => {
      console.error(err)
      setError('Не вдалося завантажити чати. Перевір правила Firestore.')
    })

    return unsubscribe
  }, [user])

  // Вхідні дзвінки
  useEffect(() => {
    if (!user) {
      setIncomingCall(null)
      return
    }

    const callsQuery = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', user.uid)
    )

    const unsubscribe = onSnapshot(callsQuery, snapshot => {
      const incoming = snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .filter(call => {
          if (call.createdBy === user.uid) return false
          if (call.status !== 'ringing') return false

          const created = call.createdAt?.toMillis?.()

          if (created && Date.now() - created > 2 * 60 * 1000) {
            return false
          }

          return true
        })
        .sort((a, b) => {
          return (b.createdAt?.toMillis?.() || 0) -
            (a.createdAt?.toMillis?.() || 0)
        })

      if (!activeCall) {
        setIncomingCall(incoming[0] || null)
      }
    }, err => {
      console.error('Incoming calls:', err)
    })

    return unsubscribe
  }, [user, activeCall])

  // Завантаження повідомлень
  useEffect(() => {
    if (!user || !activeId) {
      setMessages([])
      return
    }

    const q = query(
      collection(db, 'chats', activeId, 'messages')
    )

    const unsubscribe = onSnapshot(q, snapshot => {
      const list = snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }))

      list.sort((a, b) => {
        const dateA = a.createdAt?.toMillis?.() || 0
        const dateB = b.createdAt?.toMillis?.() || 0
        return dateA - dateB
      })

      setMessages(list)
    }, err => {
      console.error(err)
      setError('Не вдалося завантажити повідомлення.')
    })

    return unsubscribe
  }, [user, activeId])

  // Реєстрація та вхід
  async function handleAuth(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('Заповни електронну пошту та пароль.')
      return
    }

    if (mode === 'register' && !name.trim()) {
      setError("Введи своє ім'я.")
      return
    }

    if (password.length < 6) {
      setError('Пароль повинен містити щонайменше 6 символів.')
      return
    }

    setBusy(true)

    try {
      if (mode === 'register') {
        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password
        )

        await updateProfile(result.user, {
          displayName: name.trim()
        })

        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          about: '',
          photoURL: '',
          createdAt: serverTimestamp()
        })

        setUser(result.user)
      } else {
        const result = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password
        )

        setUser(result.user)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || 'Сталася помилка авторизації.')
    } finally {
      setBusy(false)
    }
  }

  // Вихід
  async function handleLogout() {
    setActiveCall(null)
    setIncomingCall(null)

    await signOut(auth)

    setPassword('')
    setMessage('')
    setViewProfileUid(null)
  }

  // Повідомлення в налаштуваннях
  function showSettingsNotice(message, isError = false) {
    setSettingsMessage(isError ? '' : message)
    setSettingsError(isError ? message : '')
  }

  // Збереження профілю
  async function saveProfile(e) {
    e.preventDefault()
    setSettingsBusy(true)
    showSettingsNotice('')

    try {
      const cleanName = profileName.trim()
      const cleanPhoto = profilePhoto.trim()
      const cleanAbout = profileAbout.trim()

      if (!cleanName) {
        throw new Error('Введи ім’я профілю.')
      }

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: cleanName,
        email: user.email,
        about: cleanAbout,
        photoURL: cleanPhoto,
        updatedAt: serverTimestamp()
      }, { merge: true })

      await updateProfile(auth.currentUser, {
        displayName: cleanName,
        photoURL: cleanPhoto || null
      })

      setProfiles(previous => ({
        ...previous,
        [user.uid]: {
          ...previous[user.uid],
          uid: user.uid,
          name: cleanName,
          email: user.email,
          about: cleanAbout,
          photoURL: cleanPhoto
        }
      }))

      showSettingsNotice('Профіль успішно збережено.')
    } catch (err) {
      console.error(err)
      showSettingsNotice(
        err.message || 'Не вдалося зберегти профіль.',
        true
      )
    } finally {
      setSettingsBusy(false)
    }
  }

  // Зміна пароля
  async function changeUserPassword(e) {
    e.preventDefault()
    setSettingsBusy(true)
    showSettingsNotice('')

    try {
      if (!currentPassword || newPassword.length < 6) {
        throw new Error(
          'Вкажи поточний пароль і новий пароль (не менше 6 символів).'
        )
      }

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      )

      await reauthenticateWithCredential(
        auth.currentUser,
        credential
      )

      await updatePassword(auth.currentUser, newPassword)

      setCurrentPassword('')
      setNewPassword('')

      showSettingsNotice('Пароль успішно змінено.')
    } catch (err) {
      console.error(err)

      const message =
        err.code === 'auth/wrong-password' ||
        err.code === 'auth/invalid-credential'
          ? 'Поточний пароль неправильний.'
          : err.code === 'auth/weak-password'
            ? 'Новий пароль занадто слабкий.'
            : err.code === 'auth/requires-recent-login'
              ? 'Увійди в акаунт повторно та спробуй ще раз.'
              : err.message || 'Не вдалося змінити пароль.'

      showSettingsNotice(message, true)
    } finally {
      setSettingsBusy(false)
    }
  }

  // Відновлення пароля
  async function resetUserPassword() {
    if (!user?.email) {
      return showSettingsNotice(
        'У профілі немає електронної пошти.',
        true
      )
    }

    try {
      await sendPasswordResetEmail(auth, user.email)

      showSettingsNotice(
        `Лист для відновлення пароля надіслано на ${user.email}.`
      )
    } catch (err) {
      console.error(err)
      showSettingsNotice(
        err.message || 'Не вдалося надіслати лист.',
        true
      )
    }
  }

  // Видалення акаунта
  async function removeAccount() {
    const confirmed = window.confirm(
      'Точно видалити акаунт NovaChat? Цю дію неможливо скасувати. Історія повідомлень у чатах може залишитися.'
    )

    if (!confirmed) return

    const passwordForDelete = window.prompt(
      'Для підтвердження введи поточний пароль:'
    )

    if (!passwordForDelete) return

    setSettingsBusy(true)

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        passwordForDelete
      )

      await reauthenticateWithCredential(
        auth.currentUser,
        credential
      )

      await deleteDoc(doc(db, 'users', user.uid))
      await deleteUser(auth.currentUser)

      setShowSettings(false)
    } catch (err) {
      console.error(err)

      const message =
        err.code === 'auth/requires-recent-login'
          ? 'Для видалення акаунта потрібно вийти та увійти знову.'
          : err.code === 'permission-denied'
            ? 'Firestore забороняє видаляти профіль. Потрібно оновити правила users.'
            : err.message || 'Не вдалося видалити акаунт.'

      showSettingsNotice(message, true)
    } finally {
      setSettingsBusy(false)
    }
  }

  // Сповіщення браузера
  async function toggleBrowserNotifications(value) {
    if (
      value &&
      'Notification' in window &&
      Notification.permission === 'default'
    ) {
      const permission = await Notification.requestPermission()

      if (permission !== 'granted') {
        showSettingsNotice(
          'Дозвіл на сповіщення не надано браузером.',
          true
        )
        return
      }
    }

    if (
      value &&
      'Notification' in window &&
      Notification.permission === 'denied'
    ) {
      showSettingsNotice(
        'Дозволь сповіщення для NovaChat у налаштуваннях браузера.',
        true
      )
      return
    }

    setNotificationsEnabled(value)

    localStorage.setItem(
      'novaNotifications',
      String(value)
    )

    showSettingsNotice(
      value ? 'Сповіщення увімкнено.' : 'Сповіщення вимкнено.'
    )
  }

  // Звук повідомлення
  function playSendSound() {
    if (!soundEnabled) return

    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext

      if (!AudioContextClass) return

      const context = new AudioContextClass()
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.connect(gain)
      gain.connect(context.destination)

      oscillator.frequency.value = 660

      gain.gain.setValueAtTime(0.045, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        context.currentTime + 0.12
      )

      oscillator.start()
      oscillator.stop(context.currentTime + 0.12)

      oscillator.onended = () => context.close()
    } catch (err) {
      console.error(err)
    }
  }

  // Пошук користувача
  async function findUsers(e) {
    e.preventDefault()
    setSearchError('')
    setSearchResults([])

    const value = search.trim().toLowerCase()

    if (!value) {
      setSearchError('Введи електронну пошту користувача.')
      return
    }

    setSearching(true)

    try {
      const q = query(
        collection(db, 'users'),
        where('email', '==', value)
      )

      const result = await getDocs(q)

      const found = result.docs
        .map(item => item.data())
        .filter(item => item.uid !== user.uid)

      setSearchResults(found)

      if (found.length === 0) {
        setSearchError('Користувача не знайдено.')
      }
    } catch (err) {
      console.error(err)
      setSearchError('Помилка пошуку. Перевір правила Firestore.')
    } finally {
      setSearching(false)
    }
  }

  // Відкриття профілю користувача
  function showUserProfile(uid) {
    if (!uid || uid === user.uid) {
      setShowSettings(true)
      setSettingsTab('profile')
      return
    }

    setViewProfileUid(uid)
    setShowSettings(false)
    setShowSearch(false)
  }

  // Створення або відкриття чату
  async function openChat(otherUser) {
    try {
      const participants = [user.uid, otherUser.uid].sort()
      const chatId = participants.join('_')

      const chatRef = doc(db, 'chats', chatId)

      await setDoc(chatRef, {
        participants,
        participantNames: {
          [user.uid]: profileName || user.displayName || 'Користувач',
          [otherUser.uid]: otherUser.name || 'Користувач'
        },
        lastMessage: '',
        updatedAt: serverTimestamp()
      }, { merge: true })

      setActiveId(chatId)
      setViewProfileUid(null)
      setShowSearch(false)
      setSearch('')
      setSearchResults([])
      setSearchError('')
    } catch (err) {
      console.error(err)
      setSearchError(
        'Не вдалося створити чат. Перевір правила Firestore.'
      )
    }
  }

  // Створення дзвінка
  async function createCall(type) {
    if (!user) {
      setError('Ти не авторизований.')
      return
    }

    if (!activeId || !activeChat || !otherUid) {
      setError('Не вдалося визначити співрозмовника. Відкрий чат ще раз.')
      return
    }

    if (user.uid === otherUid) {
      setError('Не можна телефонувати самому собі.')
      return
    }

    if (activeCall || incomingCall) {
      setError('Спочатку заверши поточний дзвінок.')
      return
    }

    if (type !== 'audio' && type !== 'video') {
      setError('Невідомий тип дзвінка.')
      return
    }

    setError('')

    try {
      const participants = [user.uid, otherUid]

      const callData = {
        createdBy: user.uid,
        participants,
        type,
        status: 'ringing',
        chatId: activeId,
        callerName: profileName || user.displayName || 'Користувач',
        recipientName: activeName || 'Користувач',
        createdAt: serverTimestamp()
      }

      console.log('Створення дзвінка:', callData)

      const callRef = await addDoc(
        collection(db, 'calls'),
        callData
      )

      console.log('Дзвінок створено:', callRef.id)

      setActiveCall({
        id: callRef.id,
        peerId: otherUid,
        peerName: activeName || 'Користувач',
        type,
        isCaller: true
      })
    } catch (err) {
      console.error('CREATE CALL ERROR:', err)

      setError(
        `Помилка дзвінка: ${err.code || 'невідома'} — ${err.message || 'Невідома причина'}`
      )
    }
  }

  // Прийняття дзвінка
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
        peerName:
          profiles[callerId]?.name ||
          call.callerName ||
          'Користувач',
        type: call.type,
        isCaller: false
      })

      setIncomingCall(null)
    } catch (err) {
      console.error('Прийняття дзвінка:', err)
      setError('Не вдалося прийняти дзвінок.')
    }
  }

  // Відхилення дзвінка
  async function declineCall() {
    if (!incomingCall) return

    const callId = incomingCall.id
    setIncomingCall(null)

    try {
      await updateDoc(doc(db, 'calls', callId), {
        status: 'ended',
        endedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Decline call:', err)
    }
  }

  // Надсилання повідомлення
  async function sendMessage(e) {
    e.preventDefault()

    const text = message.trim()

    if (!text || !activeId) return

    setMessage('')

    try {
      await addDoc(
        collection(db, 'chats', activeId, 'messages'),
        {
          text,
          senderId: user.uid,
          senderName: profileName || user.displayName || 'Користувач',
          createdAt: serverTimestamp()
        }
      )

      playSendSound()

      await setDoc(doc(db, 'chats', activeId), {
        lastMessage: text,
        updatedAt: serverTimestamp()
      }, { merge: true })
    } catch (err) {
      console.error(err)
      setMessage(text)
      setError('Повідомлення не надіслано. Спробуй ще раз.')
    }
  }

  if (loading) {
    return (
      <div className="auth-loading">
        Завантаження NovaChat...
      </div>
    )
  }

  // Сторінка входу
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

          <h1>
            {mode === 'login' ? 'З поверненням!' : 'Створи акаунт'}
          </h1>

          <p className="auth-subtitle">
            {mode === 'login'
              ? 'Увійди, щоб продовжити спілкування'
              : 'Приєднуйся до NovaChat'}
          </p>

          <form onSubmit={handleAuth} className="auth-form">
            {mode === 'register' && (
              <label>
                Твоє ім'я
                <input
                  type="text"
                  placeholder="Наприклад, Ігор"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>
            )}

            <label>
              Електронна пошта
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>

            <label>
              Пароль
              <input
                type="password"
                placeholder="Мінімум 6 символів"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            {error && (
              <div className="auth-error">{error}</div>
            )}

            <button className="auth-submit" disabled={busy}>
              {busy
                ? 'Зачекай...'
                : mode === 'login'
                  ? 'Увійти'
                  : 'Створити акаунт'}
            </button>
          </form>

          <div className="auth-switch">
            {mode === 'login'
              ? 'Ще не маєш акаунта?'
              : 'Вже маєш акаунт?'}

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

  const activeChat = chats.find(chat => chat.id === activeId)

  const otherUid = activeChat?.participants?.find(
    uid => uid !== user.uid
  )

  const activeProfile = profiles[otherUid] || {}

  const activeName =
    activeProfile.name ||
    activeChat?.participantNames?.[otherUid] ||
    'Особистий чат'

  const viewedProfile = viewProfileUid
    ? profiles[viewProfileUid] || {}
    : {}

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">N</div>
          <span>
            Nova<span className="logo-light">Chat</span>
          </span>
        </div>

        <div className="sidebar-title">
          <span>ПОВІДОМЛЕННЯ</span>

          <button
            className="add-button"
            title="Новий чат"
            onClick={() => {
              setViewProfileUid(null)
              setShowSearch(!showSearch)
            }}
          >
            ＋
          </button>
        </div>

        {showSearch && (
          <div className="new-chat">
            <form onSubmit={findUsers}>
              <input
                className="search"
                placeholder="Email користувача..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <button
                className="auth-submit"
                disabled={searching}
              >
                {searching ? 'Пошук...' : 'Знайти'}
              </button>
            </form>

            {searchError && (
              <p className="auth-error">{searchError}</p>
            )}

            {searchResults.map(item => {
              const itemProfile = profiles[item.uid] || item

              return (
                <div key={item.uid} className="chat-item search-user">
                  <button
                    className="avatar-button"
                    onClick={() => showUserProfile(item.uid)}
                    title="Відкрити профіль"
                  >
                    <Avatar
                      photoURL={itemProfile.photoURL}
                      fallback="👤"
                    />
                  </button>

                  <button
                    className="chat-info profile-link"
                    onClick={() => showUserProfile(item.uid)}
                  >
                    <strong>{itemProfile.name || 'Користувач'}</strong>
                    <span>{itemProfile.email || item.email}</span>
                  </button>

                  <button
                    className="write-user-button"
                    onClick={() => openChat(itemProfile)}
                  >
                    Написати
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="chat-list">
          {chats.map(chat => {
            const other = chat.participants?.find(
              uid => uid !== user.uid
            )

            const otherProfile = profiles[other] || {}

            return (
              <button
                key={chat.id}
                className={`chat-item ${
                  activeId === chat.id ? 'active' : ''
                }`}
                onClick={() => {
                  setActiveId(chat.id)
                  setViewProfileUid(null)
                  setShowSettings(false)
                }}
              >
                <span
                  className="avatar-button"
                  onClick={e => {
                    e.stopPropagation()
                    showUserProfile(other)
                  }}
                  title="Відкрити профіль"
                >
                  <Avatar
                    photoURL={otherProfile.photoURL}
                    fallback="👤"
                  />
                </span>

                <span
                  className="chat-info profile-link"
                  onClick={e => {
                    e.stopPropagation()
                    showUserProfile(other)
                  }}
                >
                  <strong>
                    {otherProfile.name ||
                      chat.participantNames?.[other] ||
                      'Користувач'}
                  </strong>

                  <span>
                    {chat.lastMessage || 'Почни спілкування'}
                  </span>
                </span>
              </button>
            )
          })}

          {chats.length === 0 && (
            <p className="auth-subtitle">
              Поки що чатів немає. Натисни ＋, щоб знайти користувача.
            </p>
          )}
        </div>

        <div className="profile">
          <button
            className="avatar-button"
            onClick={() => {
              setShowSettings(true)
              setSettingsTab('profile')
              setViewProfileUid(null)
            }}
            title="Мій профіль"
          >
            <Avatar
              className="avatar profile-avatar"
              photoURL={profiles[user.uid]?.photoURL || profilePhoto}
              fallback="🧑🏻"
            />
          </button>

          <div className="profile-info">
            <strong>
              {profiles[user.uid]?.name ||
                profileName ||
                user.displayName ||
                'Користувач'}
            </strong>
            <span>{user.email}</span>
          </div>

          <button
            className="profile-menu"
            onClick={() => {
              setShowSettings(true)
              setViewProfileUid(null)
              setSettingsTab('profile')
              showSettingsNotice('')
            }}
          >
            ⚙ Налаштування
          </button>
        </div>
      </aside>

      <main className="main">
        {showSettings ? (
          <section className="settings-page">
            <header className="settings-header">
              <div>
                <h1>Налаштування</h1>
                <p>Керуй профілем та параметрами NovaChat</p>
              </div>

              <button
                className="header-button"
                onClick={() => setShowSettings(false)}
                title="Закрити"
              >
                ✕
              </button>
            </header>

            <div className="settings-layout">
              <nav className="settings-nav">
                <button
                  className={settingsTab === 'profile' ? 'selected' : ''}
                  onClick={() => {
                    setSettingsTab('profile')
                    showSettingsNotice('')
                  }}
                >
                  👤 Профіль
                </button>

                <button
                  className={settingsTab === 'security' ? 'selected' : ''}
                  onClick={() => {
                    setSettingsTab('security')
                    showSettingsNotice('')
                  }}
                >
                  🔒 Безпека
                </button>

                <button
                  className={settingsTab === 'notifications' ? 'selected' : ''}
                  onClick={() => {
                    setSettingsTab('notifications')
                    showSettingsNotice('')
                  }}
                >
                  🔔 Сповіщення
                </button>

                <button
                  className={settingsTab === 'appearance' ? 'selected' : ''}
                  onClick={() => {
                    setSettingsTab('appearance')
                    showSettingsNotice('')
                  }}
                >
                  🎨 Зовнішній вигляд
                </button>

                <button
                  className={settingsTab === 'language' ? 'selected' : ''}
                  onClick={() => {
                    setSettingsTab('language')
                    showSettingsNotice('')
                  }}
                >
                  🌐 Мова
                </button>
              </nav>

              <div className="settings-content">
                {settingsTab === 'profile' && (
                  <form
                    className="settings-form"
                    onSubmit={saveProfile}
                  >
                    <h2>Профіль</h2>

                    <div className="settings-avatar">
                      {profilePhoto
                        ? <img src={profilePhoto} alt="Фото профілю" />
                        : '🧑🏻'}
                    </div>

                    <label>
                      Ім’я
                      <input
                        value={profileName}
                        onChange={e => setProfileName(e.target.value)}
                        placeholder="Твоє ім’я"
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
                        placeholder="Кілька слів про себе..."
                        rows="4"
                        maxLength={250}
                      />
                    </label>

                    <label>
                      Електронна пошта
                      <input value={user.email || ''} readOnly />
                    </label>

                    <button
                      className="auth-submit"
                      disabled={settingsBusy}
                    >
                      {settingsBusy ? 'Збереження...' : 'Зберегти профіль'}
                    </button>
                  </form>
                )}

                {settingsTab === 'security' && (
                  <div className="settings-form">
                    <h2>Безпека</h2>

                    <p className="settings-muted">
                      Зміна пароля для {user.email}
                    </p>

                    <form onSubmit={changeUserPassword}>
                      <label>
                        Поточний пароль
                        <input
                          type="password"
                          value={currentPassword}
                          onChange={e => setCurrentPassword(e.target.value)}
                          autoComplete="current-password"
                        />
                      </label>

                      <label>
                        Новий пароль
                        <input
                          type="password"
                          value={newPassword}
                          onChange={e => setNewPassword(e.target.value)}
                          placeholder="Мінімум 6 символів"
                          autoComplete="new-password"
                        />
                      </label>

                      <button
                        className="auth-submit"
                        disabled={settingsBusy}
                      >
                        Змінити пароль
                      </button>
                    </form>

                    <button
                      className="secondary-settings-button"
                      onClick={resetUserPassword}
                    >
                      Надіслати лист для відновлення пароля
                    </button>

                    <button
                      className="secondary-settings-button"
                      onClick={handleLogout}
                    >
                      Вийти з акаунта
                    </button>

                    <button
                      className="danger-settings-button"
                      onClick={removeAccount}
                      disabled={settingsBusy}
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
                        <small>
                          Короткий звук після надсилання повідомлення
                        </small>
                      </span>

                      <input
                        type="checkbox"
                        checked={soundEnabled}
                        onChange={e => {
                          setSoundEnabled(e.target.checked)
                          localStorage.setItem(
                            'novaSound',
                            String(e.target.checked)
                          )
                        }}
                      />
                    </label>

                    <label className="settings-toggle">
                      <span>
                        <strong>Сповіщення браузера</strong>
                        <small>
                          Дозвіл браузера на показ сповіщень
                        </small>
                      </span>

                      <input
                        type="checkbox"
                        checked={notificationsEnabled}
                        onChange={e =>
                          toggleBrowserNotifications(e.target.checked)
                        }
                      />
                    </label>

                    <p className="settings-muted">
                      Поки що браузерні сповіщення налаштовують дозвіл.
                      Push-сповіщення у фоні потребують окремого
                      налаштування Firebase Cloud Messaging.
                    </p>
                  </div>
                )}

                {settingsTab === 'appearance' && (
                  <div className="settings-form">
                    <h2>Зовнішній вигляд</h2>

                    <p className="settings-muted">
                      Обери тему інтерфейсу
                    </p>

                    <div className="theme-options">
                      <button
                        className={
                          theme === 'dark'
                            ? 'theme-choice selected'
                            : 'theme-choice'
                        }
                        onClick={() => setTheme('dark')}
                      >
                        🌙 Темна
                      </button>

                      <button
                        className={
                          theme === 'light'
                            ? 'theme-choice selected'
                            : 'theme-choice'
                        }
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

                    <p className="settings-muted">
                      Мова меню налаштувань і частини інтерфейсу
                    </p>

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

                    <p className="settings-muted">
                      Переклад усіх екранів буде розширюватися
                      в наступних оновленнях.
                    </p>
                  </div>
                )}

                {settingsMessage && (
                  <div className="settings-success">
                    {settingsMessage}
                  </div>
                )}

                {settingsError && (
                  <div className="auth-error">
                    {settingsError}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : viewProfileUid ? (
          <section className="user-profile-page">
            <header className="user-profile-header">
              <button
                className="header-button"
                onClick={() => setViewProfileUid(null)}
              >
                ← Назад
              </button>

              <h2>Профіль користувача</h2>
            </header>

            <div className="user-profile-card">
              <Avatar
                className="user-profile-avatar"
                photoURL={viewedProfile.photoURL}
                fallback="👤"
              />

              <h1>{viewedProfile.name || 'Користувач'}</h1>

              <p className="user-profile-email">
                {viewedProfile.email || ''}
              </p>

              <div className="user-profile-about">
                <h3>Про себе</h3>
                <p>
                  {viewedProfile.about || 'Користувач ще нічого не розповів про себе.'}
                </p>
              </div>

              <button
                className="auth-submit user-profile-message"
                onClick={() => openChat({
                  uid: viewProfileUid,
                  name: viewedProfile.name || 'Користувач'
                })}
              >
                ✉ Написати повідомлення
              </button>
            </div>
          </section>
        ) : activeChat ? (
          <>
            <header className="chat-header">
              <button
                className="chat-header-profile"
                onClick={() => showUserProfile(otherUid)}
                title="Відкрити профіль"
              >
                <Avatar
                  photoURL={activeProfile.photoURL}
                  fallback="👤"
                />

                <span className="header-info">
                  <strong>{activeName}</strong>
                  <span>Переглянути профіль</span>
                </span>
              </button>

              <div className="chat-call-actions">
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
              </div>
            </header>

            <section className="messages">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`message-row ${
                    msg.senderId === user.uid ? 'mine' : ''
                  }`}
                >
                  <div className="message-bubble">
                    {msg.text}

                    <span className="message-time">
                      {msg.createdAt?.toDate
                        ? msg.createdAt.toDate().toLocaleTimeString(
                            'uk-UA',
                            {
                              hour: '2-digit',
                              minute: '2-digit'
                            }
                          )
                        : '...'}
                    </span>
                  </div>
                </div>
              ))}
            </section>

            <form
              className="message-form"
              onSubmit={sendMessage}
            >
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Написати повідомлення..."
              />

              <button
                type="submit"
                className="send-button"
              >
                ➤
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat">
            <h2>Ласкаво просимо до NovaChat!</h2>
            <p>Знайди користувача та почни спілкування.</p>

            <button
              className="auth-submit"
              onClick={() => setShowSearch(true)}
            >
              Створити новий чат
            </button>
          </div>
        )}

        {error && (
          <div className="auth-error">{error}</div>
        )}
      </main>

      {/* Вхідний дзвінок */}
      {incomingCall && !activeCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <h2>
              Вхідний {
                incomingCall.type === 'video'
                  ? 'відеодзвінок'
                  : 'аудіодзвінок'
              }
            </h2>

            <p>
              {profiles[incomingCall.createdBy]?.name ||
                incomingCall.callerName ||
                'Користувач'} телефонує тобі
            </p>

            <div className="incoming-call-actions">
              <button
                type="button"
                onClick={declineCall}
              >
                Відхилити
              </button>

              <button
                type="button"
                onClick={acceptCall}
              >
                Прийняти
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Активний дзвінок */}
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

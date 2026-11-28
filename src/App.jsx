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
  limit,
  increment,
  arrayUnion
} from 'firebase/firestore'

const BUCKET_NAME = 'novachat-media'
const REACTIONS = ['❤️', '😂', '👍', '😮', '😢', '🔥']
const POST_REACTIONS = ['🔥', '👏', '🤔', '😂', '❤️']

const GIFTS_CATALOG = [
  { id: 'rose', name: 'Троянда', icon: '🌹', price: 10, rarity: 'Звичайний' },
  { id: 'heart', name: 'Серце', icon: '❤️', price: 25, rarity: 'Звичайний' },
  { id: 'cake', name: 'Торт', icon: '🎂', price: 50, rarity: 'Рідкісний' },
  { id: 'diamond', name: 'Діамант', icon: '💎', price: 100, rarity: 'Ексклюзив' },
  { id: 'crown', name: 'Корона', icon: '👑', price: 500, rarity: 'Легендарний' }
]

const STAR_PACKS = [
  { id: 'pack_50', stars: 50, label: '50 ⭐' },
  { id: 'pack_250', stars: 250, label: '250 ⭐' },
  { id: 'pack_1000', stars: 1000, label: '1000 ⭐' }
]

const PERSONALIZATION_ITEMS = [
  {
    id: 'theme_neon',
    category: 'profileTheme',
    categoryLabel: 'Оформлення профілю',
    title: 'Неонова галактика',
    value: 'neon',
    price: 30,
    preview: 'linear-gradient(135deg, #4f46e5, #06b6d4)'
  },
  {
    id: 'theme_gold',
    category: 'profileTheme',
    categoryLabel: 'Оформлення профілю',
    title: 'Золотий стандарт',
    value: 'gold',
    price: 60,
    preview: 'linear-gradient(135deg, #f59e0b, #d97706)'
  },
  {
    id: 'frame_glow',
    category: 'avatarFrame',
    categoryLabel: 'Рамка аватара',
    title: 'Сяйво Nova',
    value: 'glow',
    price: 20,
    preview: '2px solid #2aabee'
  },
  {
    id: 'frame_vip',
    category: 'avatarFrame',
    categoryLabel: 'Рамка аватара',
    title: 'Королівська рамка',
    value: 'vip',
    price: 75,
    preview: '3px solid #f59e0b'
  },
  {
    id: 'chatbg_midnight',
    category: 'chatBg',
    categoryLabel: 'Фон чату',
    title: 'Нічний Telegram',
    value: 'midnight',
    price: 25,
    preview: 'radial-gradient(circle at top, #1b2836, #0e1621)'
  },
  {
    id: 'chatbg_aurora',
    category: 'chatBg',
    categoryLabel: 'Фон чату',
    title: 'Північне сяйво',
    value: 'aurora',
    price: 45,
    preview: 'linear-gradient(160deg, #0f172a, #1e1b4b, #134e4a)'
  },
  {
    id: 'status_creator',
    category: 'customStatus',
    categoryLabel: 'Спеціальний статус',
    title: '🚀 Автор ідей',
    value: '🚀 Автор ідей',
    price: 15,
    preview: '#2aabee'
  },
  {
    id: 'status_pro',
    category: 'customStatus',
    categoryLabel: 'Спеціальний статус',
    title: '⚡ Nova Pro',
    value: '⚡ Nova Pro',
    price: 40,
    preview: '#0088cc'
  }
]

const DEFAULT_COMMUNITIES = [
  {
    id: 'tech',
    name: 'Технології',
    category: 'Технології',
    description: 'Розробка, ПК, Android, WebRTC та гаджети.',
    rules: 'Без спаму та реклами без погодження.',
    isPrivate: false
  },
  {
    id: 'games',
    name: 'Ігри',
    category: 'Ігри',
    description: 'Обговорення ігор, пошук напарників і кліпи.',
    rules: 'Спойлери ховаємо або попереджаємо.',
    isPrivate: false
  },
  {
    id: 'study',
    name: 'Навчання',
    category: 'Навчання',
    description: 'Конспекти, задачі, проєкти та взаємодопомога.',
    rules: 'Повага та зрозумілі формулювання питань.',
    isPrivate: false
  },
  {
    id: 'auto',
    name: 'Автомобілі',
    category: 'Автомобілі',
    description: 'Авто, ремонт, експлуатація та поради водіям.',
    rules: 'Лише конструктивні поради та обговорення.',
    isPrivate: false
  }
]

const normalizeHandle = raw => {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
  return cleaned ? `@${cleaned}` : ''
}

const normalizePhone = raw => (raw || '').replace(/[^\d+]/g, '').trim()

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

function generateNovaAiReply(promptText, mode = 'answer') {
  const clean = (promptText || '').trim()
  if (!clean) {
    return 'Напиши запитання, тему для пояснення або чернетку повідомлення — і я підготую відповідь.'
  }

  const lower = clean.toLowerCase()

  if (/^(привіт|вітаю|добрий день|добрий вечір|hi|hello)\b/i.test(lower)) {
    return 'Привіт! Я **Nova AI**. Можу допомогти розібратися з помилками, пояснити складну тему, скласти текст або підготувати чернетку для чату чи стрічки. З чого почнемо?'
  }

  if (
    lower.includes('помилк') ||
    lower.includes('не працює') ||
    lower.includes('error') ||
    lower.includes('баг')
  ) {
    return [
      `🔍 **Діагностика запиту:** «${clean}»`,
      `1. Перевір текст помилки у вікні браузера або в консолі (**F12 → Console**).`,
      `2. Звір назви змінних, станів (**useState**) і пропсів компонента, де виникає збій.`,
      `3. Переконайся, що дані оновлюються і в стані React, і в стилях/базі даних без конфлікту імен.`
    ].join('\n')
  }

  if (mode === 'study') {
    return [
      `📚 **Пояснення теми:** «${clean}»`,
      `1. **Суть:** Розділи задачу на послідовні кроки та визнач вхідні умови.`,
      `2. **Практика:** Застосуй основне правило на простому прикладі й перевір результат.`,
      `3. **Підсумок:** Важливо розуміти причинно-наслідковий зв'язок кожного кроку.`
    ].join('\n')
  }

  if (mode === 'draft') {
    return `✉ **Чернетка повідомлення на тему «${clean}»:**\n\nПривіт! Хотів коротко поділитися думками щодо «${clean}»: ключові пункти вже зібрані, тож можемо обговорити деталі та обрати найкращий варіант.`
  }

  return `💡 **Відповідь Nova AI:** Щодо «${clean}» — сформулюй точну мету або уточни умови задачі, щоб я дав детальнішу інструкцію чи готовий приклад.`
}

function FormattedAiText({ text }) {
  return (
    <div className="tg-ai-text">
      {(text || '').split(/(\*\*.*?\*\*)/g).map((part, idx) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={idx}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={idx}>{part}</span>
        )
      )}
    </div>
  )
}

function Avatar({ photoURL, className = 'avatar', fallback = '👤', alt = 'Аватар', frame = '' }) {
  const frameClass =
    frame === 'glow'
      ? 'avatar-frame-glow'
      : frame === 'vip'
        ? 'avatar-frame-vip'
        : ''

  return (
    <div className={`${className} ${frameClass}`}>
      {photoURL ? <img src={photoURL} alt={alt} loading="lazy" /> : fallback}
    </div>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mainSection, setMainSection] = useState('chats')

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [usernameInput, setUsernameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [activeCall, setActiveCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [chats, setChats] = useState([])
  const [chatFilter, setChatFilter] = useState('all')
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [mobileChatOpen, setMobileChatOpen] = useState(false)

  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const [scheduledMessages, setScheduledMessages] = useState([])

  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [profiles, setProfiles] = useState({})
  const [viewProfileUid, setViewProfileUid] = useState(null)

  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState('profile')
  const [profileName, setProfileName] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [phoneSearchable, setPhoneSearchable] = useState(true)
  const [shareActivityPublicly, setShareActivityPublicly] = useState(true)
  const [profileAbout, setProfileAbout] = useState('')
  const [profilePhoto, setProfilePhoto] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('novaSound') !== 'false')
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem('novaNotifications') === 'true'
  )
  const [devicePermissions, setDevicePermissions] = useState({
    notifications: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    microphone: 'unknown',
    camera: 'unknown'
  })
  const [theme, setTheme] = useState(() => localStorage.getItem('novaTheme') || 'dark')
  const [language, setLanguage] = useState(() => localStorage.getItem('novaLanguage') || 'uk')
  const [settingsMessage, setSettingsMessage] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)

  const [posts, setPosts] = useState([])
  const [postSort, setPostSort] = useState('new')
  const [postCommunityFilter, setPostCommunityFilter] = useState('all')
  const [postTitle, setPostTitle] = useState('')
  const [postBody, setPostBody] = useState('')
  const [postCommunityId, setPostCommunityId] = useState('tech')
  const [postMediaFile, setPostMediaFile] = useState(null)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptionsText, setPollOptionsText] = useState('')
  const [commentDrafts, setCommentDrafts] = useState({})
  const [replyTargetComment, setReplyTargetComment] = useState({})
  const [repostTargetId, setRepostTargetId] = useState(null)

  const [communities, setCommunities] = useState(DEFAULT_COMMUNITIES)
  const [selectedCommunityId, setSelectedCommunityId] = useState(null)
  const [onlyMyCommunities, setOnlyMyCommunities] = useState(false)
  const [newCommName, setNewCommName] = useState('')
  const [newCommCategory, setNewCommCategory] = useState('Технології')
  const [newCommDesc, setNewCommDesc] = useState('')
  const [newCommRules, setNewCommRules] = useState('Будьте ввічливими та дотримуйтесь правил спільноти.')
  const [newCommPrivate, setNewCommPrivate] = useState(false)

  const [starTransactions, setStarTransactions] = useState([])
  const [giftRecipientUid, setGiftRecipientUid] = useState('')
  const [supportAmount, setSupportAmount] = useState(25)
  const [reportReason, setReportReason] = useState('')

  const [friendActivities, setFriendActivities] = useState([])
  const [aiMode, setAiMode] = useState('answer')
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiHistory, setAiHistory] = useState([
    {
      id: 'welcome-ai',
      role: 'assistant',
      text: 'Привіт! Я **Nova AI**. Допоможу з відповідями на запитання, поясненням навчальних тем та чернетками текстів для чатів і стрічки.'
    }
  ])

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
  const postMediaInputRef = useRef(null)
  const seenMessageIdsRef = useRef(new Set())
  const initialMessagesLoadedRef = useRef(false)
  const viewedPostsSessionRef = useRef(new Set())

  const myProfile = profiles[user?.uid] || {}
  const myStars = typeof myProfile.stars === 'number' ? myProfile.stars : 100
  const myKarma = typeof myProfile.karma === 'number' ? myProfile.karma : 0
  const myFollowing = Array.isArray(myProfile.following) ? myProfile.following : []
  const myJoinedCommunities = Array.isArray(myProfile.joinedCommunities)
    ? myProfile.joinedCommunities
    : ['tech', 'study']
  const mySavedPosts = Array.isArray(myProfile.savedPosts) ? myProfile.savedPosts : []
  const myBlockedUsers = Array.isArray(myProfile.blockedUsers) ? myProfile.blockedUsers : []
  const myGifts = Array.isArray(myProfile.gifts) ? myProfile.gifts : []
  const ownedItems = Array.isArray(myProfile.ownedPersonalization)
    ? myProfile.ownedPersonalization
    : []
  const activePersonalization = myProfile.activePersonalization || {
    profileTheme: 'default',
    avatarFrame: 'none',
    chatBg: 'default',
    customStatus: ''
  }
  const supportStats = myProfile.supportStats || {
    totalStarsReceived: 0,
    supportersCount: 0,
    topSupporters: []
  }

  const profileStats = useMemo(() => {
    const myPosts = posts.filter(p => p.authorId === user?.uid)
    const totalViews = myPosts.reduce((acc, p) => acc + (p.viewsCount || 0), 0)
    const totalLikes = myPosts.reduce((acc, p) => acc + (p.upvotes?.length || 0), 0)
    const totalReposts = myPosts.reduce((acc, p) => acc + (p.repostsCount || 0), 0)
    const popularPosts = [...myPosts]
      .sort(
        (a, b) =>
          (b.upvotes?.length || 0) +
          (b.viewsCount || 0) * 0.1 -
          ((a.upvotes?.length || 0) + (a.viewsCount || 0) * 0.1)
      )
      .slice(0, 4)

    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const weeklyPosts = myPosts.filter(
      p => (p.createdAt?.toMillis?.() || 0) >= weekAgo
    ).length
    const weeklyLikes = myPosts
      .filter(p => (p.createdAt?.toMillis?.() || 0) >= weekAgo)
      .reduce((acc, p) => acc + (p.upvotes?.length || 0), 0)

    return {
      postsCount: myPosts.length,
      followersCount: myProfile.followersCount || 0,
      followingCount: myFollowing.length,
      totalViews,
      totalLikes,
      totalReposts,
      weeklyPosts,
      weeklyLikes,
      popularPosts
    }
  }, [posts, user?.uid, myProfile.followersCount, myFollowing.length])

  const activeChat = useMemo(
    () => chats.find(chat => chat.id === activeId) || null,
    [chats, activeId]
  )
  const filteredChats = useMemo(() => {
    const base = chats.filter(c => {
      if (c.isGroup) return true
      const peer = (c.participants || []).find(uid => uid !== user?.uid)
      return !peer || !myBlockedUsers.includes(peer)
    })
    if (chatFilter === 'groups') return base.filter(c => Boolean(c.isGroup))
    if (chatFilter === 'direct') return base.filter(c => !c.isGroup)
    return base
  }, [chats, chatFilter, user?.uid, myBlockedUsers])

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
    const base = messages.filter(m => !myBlockedUsers.includes(m.senderId))
    if (!q) return base
    return base.filter(m => (m.text || '').toLowerCase().includes(q))
  }, [messages, chatSearchQuery, myBlockedUsers])

  const currentReel = reels[reelIndex] || null

  const visiblePosts = useMemo(() => {
    const list = posts.filter(p => {
      if (myBlockedUsers.includes(p.authorId)) return false
      if (postCommunityFilter !== 'all' && p.communityId !== postCommunityFilter) return false
      if (postSort === 'saved' && !mySavedPosts.includes(p.id)) return false
      return true
    })

    if (postSort === 'top') {
      return [...list].sort((a, b) => {
        const scoreA = (a.upvotes?.length || 0) - (a.downvotes?.length || 0)
        const scoreB = (b.upvotes?.length || 0) - (b.downvotes?.length || 0)
        return scoreB - scoreA
      })
    }

    return [...list].sort(
      (a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    )
  }, [posts, postCommunityFilter, postSort, mySavedPosts, myBlockedUsers])

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
    const userRef = doc(db, 'users', user.uid)
    getDoc(userRef)
      .then(async snap => {
        if (snap.exists()) {
          const data = snap.data()
          setProfileName(data.name || user.displayName || '')
          setProfileUsername(data.username || normalizeHandle(user.email?.split('@')[0] || 'user'))
          setProfilePhone(data.phone || '')
          setPhoneSearchable(data.phoneSearchable !== false)
          setShareActivityPublicly(data.shareActivityPublicly !== false)
          setProfileAbout(data.about || '')
          setProfilePhoto(data.photoURL || user.photoURL || '')
          if (typeof data.stars !== 'number') {
            await setDoc(userRef, { stars: 100, karma: data.karma || 0 }, { merge: true })
          }
        } else {
          const fallbackHandle = normalizeHandle(user.email?.split('@')[0] || 'user')
          setProfileUsername(fallbackHandle)
          await setDoc(
            userRef,
            {
              uid: user.uid,
              name: user.displayName || 'Користувач',
              username: fallbackHandle,
              phone: '',
              phoneSearchable: true,
              shareActivityPublicly: true,
              email: user.email || '',
              about: '',
              photoURL: user.photoURL || '',
              stars: 100,
              karma: 0,
              followersCount: 0,
              following: [],
              joinedCommunities: ['tech', 'study'],
              savedPosts: [],
              blockedUsers: [],
              gifts: [],
              ownedPersonalization: [],
              activePersonalization: {
                profileTheme: 'default',
                avatarFrame: 'none',
                chatBg: 'default',
                customStatus: ''
              },
              supportStats: {
                totalStarsReceived: 0,
                supportersCount: 0,
                topSupporters: []
              },
              createdAt: serverTimestamp()
            },
            { merge: true }
          )
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
      ...posts.map(p => p.authorId).filter(Boolean),
      ...myFollowing,
      ...(viewProfileUid ? [viewProfileUid] : []),
      ...(giftRecipientUid ? [giftRecipientUid] : [])
    ])
    return [...set].sort()
  }, [user, chats, searchResults, posts, myFollowing, viewProfileUid, giftRecipientUid])

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
    if (!user || mainSection !== 'feed') return
    visiblePosts.slice(0, 8).forEach(post => {
      if (!post?.id || viewedPostsSessionRef.current.has(post.id)) return
      viewedPostsSessionRef.current.add(post.id)
      updateDoc(doc(db, 'posts', post.id), {
        viewsCount: increment(1)
      }).catch(() => {})
    })
  }, [user, mainSection, visiblePosts])

  useEffect(() => {
    if (!user || myFollowing.length === 0) {
      setFriendActivities([])
      return
    }

    const unsubs = myFollowing.slice(0, 12).map(friendUid =>
      onSnapshot(
        query(
          collection(db, 'users', friendUid, 'activities'),
          orderBy('createdAt', 'desc'),
          limit(10)
        ),
        snap => {
          const friendProfile = profiles[friendUid] || {}
          if (friendProfile.shareActivityPublicly === false) return
          const items = snap.docs.map(d => ({
            id: `${friendUid}_${d.id}`,
            friendUid,
            friendName: friendProfile.name || 'Друг',
            friendUsername: friendProfile.username || '@friend',
            ...d.data()
          }))

          setFriendActivities(prev => {
            const withoutFriend = prev.filter(x => x.friendUid !== friendUid)
            return [...withoutFriend, ...items]
              .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
              .slice(0, 25)
          })
        },
        () => {}
      )
    )

    return () => unsubs.forEach(fn => fn())
  }, [user, myFollowing, profiles])

  useEffect(() => {
    if (!user) {
      setScheduledMessages([])
      return
    }

    const q = query(
      collection(db, 'users', user.uid, 'scheduledMessages'),
      orderBy('sendAtMs', 'asc'),
      limit(30)
    )

    return onSnapshot(
      q,
      snap => {
        setScheduledMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      },
      () => {}
    )
  }, [user])

  useEffect(() => {
    if (!user || !scheduledMessages.length) return

    const timer = window.setInterval(async () => {
      const now = Date.now()
      const due = scheduledMessages.filter(m => m.status === 'pending' && (m.sendAtMs || 0) <= now)

      for (const item of due) {
        try {
          await addDoc(collection(db, 'chats', item.chatId, 'messages'), {
            text: item.text,
            senderId: user.uid,
            senderName: profileName || user.displayName || 'Користувач',
            scheduled: true,
            read: false,
            readBy: [user.uid],
            createdAt: serverTimestamp()
          })
          await setDoc(
            doc(db, 'chats', item.chatId),
            { lastMessage: item.text, updatedAt: serverTimestamp() },
            { merge: true }
          )
          await updateDoc(doc(db, 'users', user.uid, 'scheduledMessages', item.id), {
            status: 'sent',
            sentAt: serverTimestamp()
          })
          playSendSound()
        } catch (err) {
          console.error('Відкладене повідомлення:', err)
        }
      }
    }, 10000)

    return () => clearInterval(timer)
  }, [user, scheduledMessages, profileName])

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

    const markVisibleMessagesRead = list => {
      if (document.hidden || mainSection !== 'chats') return
      list.forEach(m => {
        if (m.senderId === user.uid) return
        const alreadyInReadBy = Array.isArray(m.readBy) && m.readBy.includes(user.uid)
        if (!m.read || !alreadyInReadBy) {
          updateDoc(doc(db, 'chats', activeId, 'messages', m.id), {
            read: true,
            readBy: arrayUnion(user.uid)
          }).catch(() => {})
        }
      })
    }

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
          list.forEach(m => seenMessageIdsRef.current.add(m.id))
          markVisibleMessagesRead(list)
          initialMessagesLoadedRef.current = true
          return
        }

        markVisibleMessagesRead(list)

        list.forEach(m => {
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
  }, [user, activeId, mainSection, notificationsEnabled, mobileChatOpen])

  useEffect(() => {
    if (!user || !activeId || mainSection !== 'chats') return

    const handleVisible = () => {
      if (document.hidden) return
      messages.forEach(m => {
        if (m.senderId === user.uid) return
        const alreadyInReadBy = Array.isArray(m.readBy) && m.readBy.includes(user.uid)
        if (!m.read || !alreadyInReadBy) {
          updateDoc(doc(db, 'chats', activeId, 'messages', m.id), {
            read: true,
            readBy: arrayUnion(user.uid)
          }).catch(() => {})
        }
      })
    }

    document.addEventListener('visibilitychange', handleVisible)
    return () => document.removeEventListener('visibilitychange', handleVisible)
  }, [user, activeId, mainSection, messages])

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
    if (!user) {
      setPosts([])
      return
    }
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(80))
    return onSnapshot(
      q,
      snap => {
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      },
      console.error
    )
  }, [user])

  useEffect(() => {
    if (!user) {
      setCommunities(DEFAULT_COMMUNITIES)
      return
    }
    const q = query(collection(db, 'communities'), limit(60))
    return onSnapshot(
      q,
      snap => {
        const custom = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        const map = new Map(DEFAULT_COMMUNITIES.map(c => [c.id, c]))
        custom.forEach(c => map.set(c.id, { ...map.get(c.id), ...c }))
        setCommunities([...map.values()])
      },
      console.error
    )
  }, [user])

  useEffect(() => {
    if (!user) {
      setStarTransactions([])
      return
    }
    const q = query(
      collection(db, 'users', user.uid, 'starTransactions'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )
    return onSnapshot(
      q,
      snap => {
        setStarTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      },
      console.error
    )
  }, [user])

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

  async function addKarma(targetUid, delta) {
    if (!targetUid || !delta) return
    await updateDoc(doc(db, 'users', targetUid), {
      karma: increment(delta)
    }).catch(() => {})
  }

  async function logStarTransaction(uid, title, delta, meta = {}) {
    if (!uid) return
    await addDoc(collection(db, 'users', uid, 'starTransactions'), {
      title,
      delta,
      ...meta,
      createdAt: serverTimestamp()
    }).catch(console.error)
  }

  async function recordFriendActivity(kind, label) {
    if (!user?.uid || !shareActivityPublicly) return
    await addDoc(collection(db, 'users', user.uid, 'activities'), {
      kind,
      label,
      createdAt: serverTimestamp()
    }).catch(() => {})
  }

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
        const cleanHandle =
          normalizeHandle(usernameInput) || normalizeHandle(cleanEmail.split('@')[0]) || '@user'
        const cleanPhone = normalizePhone(phoneInput)

        const result = await createUserWithEmailAndPassword(auth, cleanEmail, password)
        await updateProfile(result.user, { displayName: cleanName })
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          name: cleanName,
          username: cleanHandle,
          phone: cleanPhone,
          phoneSearchable: true,
          shareActivityPublicly: true,
          email: cleanEmail,
          about: '',
          photoURL: '',
          stars: 100,
          karma: 5,
          followersCount: 0,
          following: [],
          joinedCommunities: ['tech', 'study'],
          savedPosts: [],
          blockedUsers: [],
          gifts: [],
          ownedPersonalization: [],
          activePersonalization: {
            profileTheme: 'default',
            avatarFrame: 'none',
            chatBg: 'default',
            customStatus: ''
          },
          supportStats: {
            totalStarsReceived: 0,
            supportersCount: 0,
            topSupporters: []
          },
          createdAt: serverTimestamp(),
          isOnline: true,
          lastSeen: serverTimestamp()
        })
        await logStarTransaction(result.user.uid, 'Стартовий бонус NovaStars', 100)
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

      const cleanHandle = normalizeHandle(profileUsername) || '@user'
      const cleanPhone = normalizePhone(profilePhone)
      const cleanPhoto = profilePhoto.trim()
      const cleanAbout = profileAbout.trim()

      setProfileUsername(cleanHandle)
      setProfilePhone(cleanPhone)

      await setDoc(
        doc(db, 'users', user.uid),
        {
          uid: user.uid,
          name: cleanName,
          username: cleanHandle,
          phone: cleanPhone,
          phoneSearchable: Boolean(phoneSearchable),
          shareActivityPublicly: Boolean(shareActivityPublicly),
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
      setDevicePermissions(prev => ({ ...prev, notifications: permission }))
      if (permission !== 'granted') {
        return showSettingsNotice('Дозвіл на сповіщення не надано.', true)
      }
    }
    setNotificationsEnabled(value)
    localStorage.setItem('novaNotifications', String(value))
    showSettingsNotice(value ? 'Сповіщення увімкнено.' : 'Сповіщення вимкнено.')
  }

  async function requestNotificationPermissionInApp() {
    if (!('Notification' in window)) {
      return showSettingsNotice('Цей браузер/пристрій не підтримує сповіщення.', true)
    }
    const result = await Notification.requestPermission()
    setDevicePermissions(prev => ({ ...prev, notifications: result }))
    setNotificationsEnabled(result === 'granted')
    localStorage.setItem('novaNotifications', String(result === 'granted'))
    showSettingsNotice(
      result === 'granted'
        ? 'Дозвіл на сповіщення надано.'
        : 'Дозвіл на сповіщення не надано або заблоковано.',
      result !== 'granted'
    )
  }

  async function requestMediaPermissionInApp(kind) {
    if (!navigator.mediaDevices?.getUserMedia) {
      return showSettingsNotice(
        'Медіапристрої недоступні. Перевір HTTPS або дозволи оболонки.',
        true
      )
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: kind === 'camera' ? { facingMode: 'user' } : false
      })
      stream.getTracks().forEach(track => track.stop())
      setDevicePermissions(prev => ({
        ...prev,
        microphone: 'granted',
        ...(kind === 'camera' ? { camera: 'granted' } : {})
      }))
      showSettingsNotice(
        kind === 'camera'
          ? 'Доступ до камери та мікрофона відкрито.'
          : 'Доступ до мікрофона відкрито.'
      )
    } catch (err) {
      setDevicePermissions(prev => ({
        ...prev,
        ...(kind === 'camera' ? { camera: 'denied' } : { microphone: 'denied' })
      }))
      showSettingsNotice(
        err.name === 'NotAllowedError'
          ? 'Дозвіл відхилено. Увімкни його у налаштуваннях браузера або Android.'
          : err.message || 'Не вдалося отримати доступ до пристрою.',
        true
      )
    }
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
    const raw = search.trim()
    if (!raw) return setSearchError('Введи @username, ім’я, номер телефону або email.')

    setSearching(true)
    try {
      const snap = await getDocs(query(collection(db, 'users'), limit(100)))
      const qLower = raw.toLowerCase()
      const qHandle = normalizeHandle(raw)
      const qPhone = normalizePhone(raw)

      const found = snap.docs
        .map(d => ({ uid: d.id, ...d.data() }))
        .filter(u => {
          if (!u.uid || u.uid === user.uid || myBlockedUsers.includes(u.uid)) return false
          const byEmail = (u.email || '').toLowerCase() === qLower
          const byHandle = qHandle && (u.username || '').toLowerCase() === qHandle
          const byName = (u.name || '').toLowerCase().includes(qLower)
          const phoneAllowed = u.phoneSearchable !== false
          const byPhone =
            phoneAllowed &&
            qPhone &&
            qPhone.length >= 6 &&
            normalizePhone(u.phone || '').includes(qPhone)
          return byEmail || byHandle || byName || byPhone
        })

      setSearchResults(found)
      if (!found.length) {
        setSearchError('Користувача не знайдено або пошук за номером обмежено приватністю.')
      }
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

  async function toggleFollowUser(targetUid) {
    if (!targetUid || targetUid === user.uid) return
    const isFollowing = myFollowing.includes(targetUid)
    const nextFollowing = isFollowing
      ? myFollowing.filter(x => x !== targetUid)
      : [...myFollowing, targetUid]

    await updateDoc(doc(db, 'users', user.uid), { following: nextFollowing }).catch(console.error)
    await updateDoc(doc(db, 'users', targetUid), {
      followersCount: increment(isFollowing ? -1 : 1)
    }).catch(() => {})
    if (!isFollowing) {
      const targetName = profiles[targetUid]?.name || 'користувача'
      await recordFriendActivity('follow', `підписався(лась) на ${targetName}`)
    }
  }

  async function toggleBlockUser(targetUid) {
    if (!targetUid || targetUid === user.uid) return
    const blocked = myBlockedUsers.includes(targetUid)
    const nextBlocked = blocked
      ? myBlockedUsers.filter(x => x !== targetUid)
      : [...myBlockedUsers, targetUid]
    await updateDoc(doc(db, 'users', user.uid), { blockedUsers: nextBlocked }).catch(console.error)
  }

  async function reportTarget({ targetType, targetId, targetUserId }) {
    const reason = reportReason.trim() || 'Порушення правил спільноти'
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        targetType,
        targetId,
        targetUserId: targetUserId || '',
        reason,
        createdAt: serverTimestamp()
      })
      setReportReason('')
      setError('Скаргу надіслано на модерацію.')
    } catch (err) {
      console.error(err)
      setError('Не вдалося надіслати скаргу.')
    }
  }

  async function createPost(e) {
    e.preventDefault()
    const title = postTitle.trim()
    const body = postBody.trim()
    if (!title || !body) return

    setUploading(true)
    setError('')
    try {
      let mediaUrl = ''
      let mediaType = ''
      if (postMediaFile) {
        if (postMediaFile.size > 50 * 1024 * 1024) {
          throw new Error('Максимальний розмір медіа — 50 МБ.')
        }
        const safeName = postMediaFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `posts/${user.uid}/${Date.now()}_${safeName}`
        mediaUrl = await uploadToSupabase(path, postMediaFile, postMediaFile.type)
        mediaType = postMediaFile.type.startsWith('video/') ? 'video' : 'image'
      }

      const rawOptions = pollOptionsText
        .split(/[,\n]/)
        .map(s => s.trim())
        .filter(Boolean)
      const poll =
        pollQuestion.trim() && rawOptions.length >= 2
          ? {
              question: pollQuestion.trim(),
              options: rawOptions.map((label, idx) => ({ id: String(idx), label, votes: [] }))
            }
          : null

      const comm = communities.find(c => c.id === postCommunityId) || communities[0]

      await addDoc(collection(db, 'posts'), {
        title,
        body,
        communityId: comm?.id || 'tech',
        communityName: comm?.name || 'Технології',
        authorId: user.uid,
        authorName: profileName || user.displayName || 'Користувач',
        authorUsername: profileUsername || '@user',
        mediaUrl,
        mediaType,
        poll,
        upvotes: [user.uid],
        downvotes: [],
        reactions: {},
        comments: [],
        viewsCount: 1,
        repostsCount: 0,
        starsReceived: 0,
        createdAt: serverTimestamp()
      })

      await addKarma(user.uid, 3)
      await recordFriendActivity('post', `опублікував(ла) допис «${title}»`)
      setPostTitle('')
      setPostBody('')
      setPostMediaFile(null)
      setPollQuestion('')
      setPollOptionsText('')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Не вдалося створити публікацію.')
    } finally {
      setUploading(false)
    }
  }

  async function repostPostToFeed(post) {
    if (!post) return
    try {
      await addDoc(collection(db, 'posts'), {
        title: `🔁 ${post.title}`,
        body: post.body,
        communityId: post.communityId || 'tech',
        communityName: post.communityName || 'Технології',
        authorId: user.uid,
        authorName: profileName || user.displayName || 'Користувач',
        authorUsername: profileUsername || '@user',
        mediaUrl: post.mediaUrl || '',
        mediaType: post.mediaType || '',
        repostOf: {
          postId: post.id,
          originalAuthorId: post.authorId,
          originalAuthorName: post.authorName || 'Користувач',
          originalAuthorUsername: post.authorUsername || '@user'
        },
        upvotes: [],
        downvotes: [],
        reactions: {},
        comments: [],
        viewsCount: 1,
        repostsCount: 0,
        starsReceived: 0,
        createdAt: serverTimestamp()
      })
      await updateDoc(doc(db, 'posts', post.id), {
        repostsCount: increment(1)
      }).catch(() => {})
      await recordFriendActivity('repost', `репостнув(ла) допис «${post.title}»`)
      setRepostTargetId(null)
      setError('🔁 Допис поширено у вашу стрічку!')
    } catch (err) {
      console.error(err)
      setError('Не вдалося зробити репост.')
    }
  }

  async function sharePostToChat(post, targetChatId) {
    if (!post || !targetChatId) return
    const text = `🔁 Репост допису «${post.title}» від ${post.authorName || 'Користувача'}:\n${post.body}`
    try {
      await addDoc(collection(db, 'chats', targetChatId, 'messages'), {
        text,
        senderId: user.uid,
        senderName: profileName || user.displayName || 'Користувач',
        read: false,
        readBy: [user.uid],
        createdAt: serverTimestamp()
      })
      await setDoc(
        doc(db, 'chats', targetChatId),
        { lastMessage: `🔁 ${post.title}`, updatedAt: serverTimestamp() },
        { merge: true }
      )
      await updateDoc(doc(db, 'posts', post.id), {
        repostsCount: increment(1)
      }).catch(() => {})
      playSendSound()
      setRepostTargetId(null)
      setError('✉ Допис надіслано в обраний чат!')
    } catch (err) {
      console.error(err)
      setError('Не вдалося надіслати допис у чат.')
    }
  }

  async function votePost(post, dir) {
    if (!post?.id) return
    const up = new Set(post.upvotes || [])
    const down = new Set(post.downvotes || [])
    let karmaDelta = 0

    if (dir === 1) {
      if (up.has(user.uid)) {
        up.delete(user.uid)
        karmaDelta = -1
      } else {
        up.add(user.uid)
        if (down.has(user.uid)) karmaDelta += 1
        down.delete(user.uid)
        karmaDelta += 1
      }
    } else {
      if (down.has(user.uid)) {
        down.delete(user.uid)
      } else {
        down.add(user.uid)
        if (up.has(user.uid)) karmaDelta -= 1
        up.delete(user.uid)
      }
    }

    await updateDoc(doc(db, 'posts', post.id), {
      upvotes: [...up],
      downvotes: [...down]
    }).catch(console.error)

    if (karmaDelta !== 0 && post.authorId !== user.uid) {
      await addKarma(post.authorId, karmaDelta)
    }
  }

  async function reactToPost(post, emoji) {
    if (!post?.id) return
    const reactions = { ...(post.reactions || {}) }
    const list = new Set(reactions[emoji] || [])
    if (list.has(user.uid)) list.delete(user.uid)
    else list.add(user.uid)
    if (list.size === 0) delete reactions[emoji]
    else reactions[emoji] = [...list]

    await updateDoc(doc(db, 'posts', post.id), { reactions }).catch(console.error)
  }

  async function votePoll(post, optionId) {
    if (!post?.poll?.options) return
    const nextOptions = post.poll.options.map(opt => {
      const withoutMe = (opt.votes || []).filter(uid => uid !== user.uid)
      if (opt.id === optionId && !(opt.votes || []).includes(user.uid)) {
        return { ...opt, votes: [...withoutMe, user.uid] }
      }
      return { ...opt, votes: withoutMe }
    })
    await updateDoc(doc(db, 'posts', post.id), {
      'poll.options': nextOptions
    }).catch(console.error)
  }

  async function addPostComment(post) {
    const text = (commentDrafts[post.id] || '').trim()
    if (!text) return
    const parentComment = replyTargetComment[post.id] || null

    const nextComments = [
      ...(post.comments || []),
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        authorId: user.uid,
        authorName: profileName || user.displayName || 'Користувач',
        authorUsername: profileUsername || '@user',
        text,
        parentId: parentComment?.id || null,
        parentAuthor: parentComment?.authorName || null,
        createdAt: Date.now()
      }
    ]

    await updateDoc(doc(db, 'posts', post.id), { comments: nextComments }).catch(console.error)
    setCommentDrafts(prev => ({ ...prev, [post.id]: '' }))
    setReplyTargetComment(prev => ({ ...prev, [post.id]: null }))
    if (post.authorId !== user.uid) await addKarma(post.authorId, 1)
  }

  async function toggleSavePost(postId) {
    const exists = mySavedPosts.includes(postId)
    const nextSaved = exists
      ? mySavedPosts.filter(id => id !== postId)
      : [...mySavedPosts, postId]
    await updateDoc(doc(db, 'users', user.uid), { savedPosts: nextSaved }).catch(console.error)
  }

  async function createCommunity(e) {
    e.preventDefault()
    const cleanName = newCommName.trim()
    if (!cleanName) return
    const slug = `${cleanName.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, '_')}_${Date.now().toString().slice(-4)}`

    try {
      await setDoc(doc(db, 'communities', slug), {
        id: slug,
        name: cleanName,
        category: newCommCategory,
        description: newCommDesc.trim() || 'Тематична спільнота NovaChat.',
        rules: newCommRules.trim() || 'Дотримуйтесь правил спільноти.',
        isPrivate: Boolean(newCommPrivate),
        ownerId: user.uid,
        moderators: [user.uid],
        membersCount: 1,
        createdAt: serverTimestamp()
      })
      const nextJoined = [...new Set([...myJoinedCommunities, slug])]
      await updateDoc(doc(db, 'users', user.uid), { joinedCommunities: nextJoined }).catch(() => {})
      await recordFriendActivity('community', `створив(ла) спільноту «${cleanName}»`)
      setNewCommName('')
      setNewCommDesc('')
      setPostCommunityFilter(slug)
      setPostCommunityId(slug)
      setSelectedCommunityId(slug)
    } catch (err) {
      console.error(err)
      setError('Не вдалося створити спільноту.')
    }
  }

  async function toggleJoinCommunity(commId) {
    const joined = myJoinedCommunities.includes(commId)
    const nextJoined = joined
      ? myJoinedCommunities.filter(id => id !== commId)
      : [...myJoinedCommunities, commId]

    await updateDoc(doc(db, 'users', user.uid), { joinedCommunities: nextJoined }).catch(console.error)
    await updateDoc(doc(db, 'communities', commId), {
      membersCount: increment(joined ? -1 : 1)
    }).catch(() => {})
    if (!joined) {
      const comm = communities.find(c => c.id === commId)
      await recordFriendActivity('community', `приєднався(лась) до спільноти «${comm?.name || commId}»`)
    }
  }

  async function buyStarPack(pack) {
    try {
      const nextBalance = myStars + pack.stars
      await setDoc(
        doc(db, 'users', user.uid),
        { stars: nextBalance },
        { merge: true }
      )
      await logStarTransaction(
        user.uid,
        `Поповнення NovaStars (${pack.label})`,
        pack.stars,
        { type: 'purchase', packId: pack.id }
      )
    } catch (err) {
      console.error(err)
      setError('Не вдалося оновити баланс NovaStars.')
    }
  }

  async function handlePersonalizationItem(item) {
    const alreadyOwned = ownedItems.includes(item.id)
    if (!alreadyOwned && myStars < item.price) {
      return setError(`Недостатньо NovaStars для «${item.title}» (${item.price} ⭐).`)
    }

    try {
      const nextOwned = alreadyOwned ? ownedItems : [...ownedItems, item.id]
      const nextActive = {
        ...activePersonalization,
        [item.category]: item.value
      }
      const updates = {
        ownedPersonalization: nextOwned,
        activePersonalization: nextActive
      }
      if (!alreadyOwned) {
        updates.stars = myStars - item.price
      }

      await setDoc(doc(db, 'users', user.uid), updates, { merge: true })

      if (!alreadyOwned) {
        await logStarTransaction(
          user.uid,
          `Персоналізація: ${item.title}`,
          -item.price,
          { type: 'personalization', itemId: item.id }
        )
        await recordFriendActivity('achievement', `отримав(ла) стиль «${item.title}»`)
      }
    } catch (err) {
      console.error(err)
      setError('Не вдалося застосувати елемент персоналізації.')
    }
  }

  async function sendGiftToUser(gift, targetUid, postId = null, customStarsAmount = null) {
    const recipientId = targetUid || giftRecipientUid
    const amount =
      typeof customStarsAmount === 'number' && customStarsAmount > 0
        ? customStarsAmount
        : gift.price

    if (!recipientId) {
      return setError('Обери отримувача підтримки або автора публікації.')
    }
    if (recipientId === user.uid) {
      return setError('Не можна підтримати зірками самого себе.')
    }
    if (myStars < amount) {
      return setError(`Недостатньо NovaStars (${amount} ⭐).`)
    }

    const recipient = profiles[recipientId] || {}
    const senderLabel = profileName || user.displayName || 'Користувач'
    const giftRecord = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      giftId: gift.id,
      name: customStarsAmount ? `Підтримка автора (${amount} ⭐)` : gift.name,
      icon: gift.icon,
      price: amount,
      rarity: gift.rarity,
      fromUid: user.uid,
      fromName: senderLabel,
      fromUsername: profileUsername || '@user',
      createdAt: Date.now()
    }

    const prevStats = recipient.supportStats || {
      totalStarsReceived: 0,
      supportersCount: 0,
      topSupporters: []
    }
    const existingSupporter = (prevStats.topSupporters || []).find(s => s.uid === user.uid)
    const nextSupporters = existingSupporter
      ? (prevStats.topSupporters || []).map(s =>
          s.uid === user.uid ? { ...s, stars: (s.stars || 0) + amount } : s
        )
      : [
          ...(prevStats.topSupporters || []),
          { uid: user.uid, name: senderLabel, stars: amount }
        ]
    nextSupporters.sort((a, b) => (b.stars || 0) - (a.stars || 0))

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        stars: myStars - amount
      })
      await setDoc(
        doc(db, 'users', recipientId),
        {
          stars: increment(amount),
          karma: increment(Math.max(1, Math.floor(amount / 10))),
          gifts: [giftRecord, ...(Array.isArray(recipient.gifts) ? recipient.gifts : [])],
          supportStats: {
            totalStarsReceived: (prevStats.totalStarsReceived || 0) + amount,
            supportersCount: existingSupporter
              ? prevStats.supportersCount || nextSupporters.length
              : (prevStats.supportersCount || 0) + 1,
            topSupporters: nextSupporters.slice(0, 8)
          }
        },
        { merge: true }
      )
      if (postId) {
        await updateDoc(doc(db, 'posts', postId), {
          starsReceived: increment(amount)
        }).catch(() => {})
      }

      await logStarTransaction(
        user.uid,
        `Підтримка ${recipient.name || recipient.username || 'автора'} (${gift.icon} ${amount} ⭐)`,
        -amount,
        { type: 'support_sent', recipientId, postId: postId || null }
      )
      await logStarTransaction(
        recipientId,
        `Підтримка від ${senderLabel} (${gift.icon} +${amount} ⭐)`,
        amount,
        { type: 'support_received', senderId: user.uid, postId: postId || null }
      )
    } catch (err) {
      console.error(err)
      setError('Не вдалося надіслати підтримку.')
    }
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
      setMainSection('chats')
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

      setMainSection('chats')
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

    if (scheduleEnabled) {
      const targetMs = scheduleAt ? new Date(scheduleAt).getTime() : Date.now() + 60000
      if (!Number.isFinite(targetMs) || targetMs <= Date.now()) {
        return setError('Обери майбутній час для відкладеного повідомлення.')
      }

      try {
        await addDoc(collection(db, 'users', user.uid, 'scheduledMessages'), {
          chatId: activeId,
          chatName: activeName,
          text,
          sendAtMs: targetMs,
          status: 'pending',
          createdAt: serverTimestamp()
        })
        setMessage('')
        setScheduleEnabled(false)
        setScheduleAt('')
        setError('⏰ Повідомлення заплановано до відправлення.')
      } catch (err) {
        console.error(err)
        setError('Не вдалося запланувати повідомлення.')
      }
      return
    }

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
        readBy: [user.uid],
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

  async function cancelScheduledMessage(schedId) {
    if (!user?.uid || !schedId) return
    await deleteDoc(doc(db, 'users', user.uid, 'scheduledMessages', schedId)).catch(() =>
      setError('Не вдалося скасувати відкладене повідомлення.')
    )
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
        readBy: [user.uid],
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
            readBy: [user.uid],
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
        readBy: [user.uid],
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

  function handleAskNovaAi(e) {
    e.preventDefault()
    const clean = aiPrompt.trim()
    if (!clean) return
    const replyText = generateNovaAiReply(clean, aiMode)
    setAiHistory(prev => [
      ...prev,
      { id: `${Date.now()}_u`, role: 'user', text: clean },
      { id: `${Date.now()}_a`, role: 'assistant', text: replyText }
    ])
    setAiPrompt('')
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
              <>
                <label>
                  Твоє ім’я
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Наприклад, Ігор"
                  />
                </label>
                <label>
                  Username (@нікнейм)
                  <input
                    value={usernameInput}
                    onChange={e => setUsernameInput(e.target.value)}
                    placeholder="@igor"
                  />
                </label>
                <label>
                  Номер телефону (необов’язково)
                  <input
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="+380..."
                  />
                </label>
              </>
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

  const knownUsersList = Object.values(profiles).filter(p => p.uid && p.uid !== user.uid)

  return (
    <div
      className={`app tg-app ${mobileChatOpen ? 'mobile-chat-open' : ''}`}
      data-profile-theme={activePersonalization.profileTheme || 'default'}
    >
      <aside className="sidebar tg-sidebar">
        <div className="logo tg-top-bar">
          <div className="logo-icon">N</div>
          <span>
            Nova<span className="logo-light">Chat</span>
          </span>
          <button
            type="button"
            className="tool-chip tg-star-pill"
            onClick={() => {
              setMainSection('stars')
              setSelectedCommunityId(null)
              setShowSettings(false)
              setViewProfileUid(null)
              setReelsOpen(false)
              setMobileChatOpen(true)
            }}
          >
            ⭐ {myStars}
          </button>
        </div>

        <div className="sidebar-tools tg-nav-strip">
          {[
            ['chats', '💬 Чати'],
            ['feed', '📰 Стрічка'],
            ['communities', '👥 Спільноти'],
            ['stars', '🎁 Зірки'],
            ['ai', '🤖 Nova AI']
          ].map(([sec, label]) => (
            <button
              type="button"
              key={sec}
              className={`tool-chip ${mainSection === sec && !showSettings && !viewProfileUid && !reelsOpen ? 'active-chip' : ''}`}
              onClick={() => {
                setMainSection(sec)
                setSelectedCommunityId(null)
                setShowSettings(false)
                setViewProfileUid(null)
                setReelsOpen(false)
                if (sec !== 'chats') setMobileChatOpen(true)
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="stories-strip">
          <button
            type="button"
            className="story-add"
            onClick={() => storyInputRef.current?.click()}
            disabled={uploading}
          >
            <div className="story-ring story-ring-add">
              <Avatar
                photoURL={profiles[user.uid]?.photoURL || profilePhoto}
                frame={activePersonalization.avatarFrame}
                fallback="＋"
              />
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
                      frame={profiles[item.uid]?.activePersonalization?.avatarFrame}
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
                <Avatar
                  photoURL={profilePhoto}
                  frame={activePersonalization.avatarFrame}
                  fallback="🧑🏻"
                />
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
            title="Пошук людей і новий чат"
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

        <div className="chat-filter-tabs tg-tabs">
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
                placeholder="@username, ім'я, телефон або email..."
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
                    <Avatar
                      photoURL={p.photoURL}
                      frame={p.activePersonalization?.avatarFrame}
                    />
                  </button>
                  <button
                    type="button"
                    className="chat-info profile-link"
                    onClick={() => showUserProfile(item.uid)}
                  >
                    <strong>{p.name || 'Користувач'}</strong>
                    <span>{p.username || p.email}</span>
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
                className={`chat-item ${mainSection === 'chats' && activeId === chat.id && !showSettings && !viewProfileUid && !reelsOpen ? 'active' : ''}`}
                onClick={() => {
                  setMainSection('chats')
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
                    frame={chat.isGroup ? '' : p.activePersonalization?.avatarFrame}
                    fallback={chat.isGroup ? '👥' : '👤'}
                  />
                  {online && <i className="online-dot" title="У мережі" />}
                </span>
                <span className="chat-info">
                  <strong>{title}</strong>
                  <span>
                    {p.activePersonalization?.customStatus
                      ? `${p.activePersonalization.customStatus} · `
                      : ''}
                    {chat.lastMessage || 'Почни спілкування'}
                  </span>
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

        <div className="profile tg-footer-profile">
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
              frame={activePersonalization.avatarFrame}
              fallback="🧑🏻"
            />
          </button>
          <div className="profile-info">
            <strong>
              {profiles[user.uid]?.name || profileName || user.displayName || 'Користувач'}
            </strong>
            <span>
              {activePersonalization.customStatus
                ? `${activePersonalization.customStatus} · `
                : ''}
              Карма {myKarma}
            </span>
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

      <main className="main tg-main">
        {reelsOpen ? (
          <section className="reels-page tg-scroll-section">
            <header className="reels-header tg-header">
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
          <section className="settings-page tg-scroll-section">
            <header className="settings-header tg-header">
              <div>
                <h1>Налаштування</h1>
                <p>
                  Керуй профілем, приватністю, кармою ({myKarma}) та балансом ({myStars} ⭐)
                </p>
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
                  ['stats', '📊 Статистика'],
                  ['privacy', '🛡️ Приватність'],
                  ['security', '🔒 Безпека'],
                  ['notifications', '🔔 Сповіщення та дозволи'],
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
                      Username (@нікнейм)
                      <input
                        value={profileUsername}
                        onChange={e => setProfileUsername(e.target.value)}
                        placeholder="@igor"
                        maxLength={32}
                      />
                    </label>
                    <label>
                      Номер телефону
                      <input
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        placeholder="+380..."
                        maxLength={24}
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

                    <div className="group-members-list">
                      <span className="group-member-pill">⭐ {myStars} NovaStars</span>
                      <span className="group-member-pill">⚡ Карма: {myKarma}</span>
                      <span className="group-member-pill">👥 Підписок: {myFollowing.length}</span>
                      <span className="group-member-pill">🎁 Подарунків: {myGifts.length}</span>
                    </div>

                    <button className="auth-submit" disabled={settingsBusy}>
                      {settingsBusy ? 'Збереження...' : 'Зберегти профіль'}
                    </button>
                  </form>
                )}

                {settingsTab === 'stats' && (
                  <div className="settings-form">
                    <h2>📊 Статистика профілю</h2>
                    <div className="group-members-list">
                      <span className="group-member-pill">
                        👁 Переглядів дописів: {profileStats.totalViews}
                      </span>
                      <span className="group-member-pill">
                        👍 Лайків: {profileStats.totalLikes}
                      </span>
                      <span className="group-member-pill">
                        👥 Підписників: {profileStats.followersCount}
                      </span>
                      <span className="group-member-pill">
                        🔁 Репостів: {profileStats.totalReposts}
                      </span>
                    </div>

                    <div className="user-profile-about">
                      <h3>За останній тиждень</h3>
                      <p className="settings-muted">
                        Опубліковано дописів: <b>{profileStats.weeklyPosts}</b> · Отримано лайків:{' '}
                        <b>{profileStats.weeklyLikes}</b>
                      </p>
                    </div>

                    <div className="user-profile-about">
                      <h3>Популярні публікації</h3>
                      {profileStats.popularPosts.length ? (
                        profileStats.popularPosts.map(p => (
                          <div key={p.id} className="reel-comment-item">
                            <b>{p.title}</b> — <span>👁 {p.viewsCount || 0}</span> ·{' '}
                            <span>▲ {(p.upvotes || []).length}</span>
                          </div>
                        ))
                      ) : (
                        <p className="settings-muted">
                          Створи публікацію у Стрічці, щоб бачити її статистику.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {settingsTab === 'privacy' && (
                  <div className="settings-form">
                    <h2>Приватність та безпека</h2>
                    <label className="settings-toggle">
                      <span>
                        <strong>Пошук за номером телефону</strong>
                        <small>Дозволити іншим знаходити тебе за номером телефону</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={phoneSearchable}
                        onChange={e => setPhoneSearchable(e.target.checked)}
                      />
                    </label>
                    <label className="settings-toggle">
                      <span>
                        <strong>Показувати активність друзям</strong>
                        <small>Дозволити друзям бачити твої нові дописи, спільноти та досягнення</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={shareActivityPublicly}
                        onChange={e => setShareActivityPublicly(e.target.checked)}
                      />
                    </label>
                    <button
                      type="button"
                      className="auth-submit"
                      onClick={saveProfile}
                      disabled={settingsBusy}
                    >
                      Зберегти приватність
                    </button>
                    <p className="settings-muted">
                      Заблоковані користувачі: {myBlockedUsers.length}
                    </p>
                    {myBlockedUsers.map(uid => (
                      <div key={uid} className="chat-item">
                        <span>{profiles[uid]?.name || uid}</span>
                        <button
                          type="button"
                          className="write-user-button"
                          onClick={() => toggleBlockUser(uid)}
                        >
                          Розблокувати
                        </button>
                      </div>
                    ))}
                  </div>
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
                    <h2>Сповіщення та дозволи</h2>
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

                    <div className="user-profile-about">
                      <h3>Дозволи застосунку на пристрої</h3>
                      <p className="settings-muted">
                        Сповіщення: <b>{devicePermissions.notifications}</b> · Мікрофон:{' '}
                        <b>{devicePermissions.microphone}</b> · Камера:{' '}
                        <b>{devicePermissions.camera}</b>
                      </p>
                      <div className="sidebar-tools">
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={requestNotificationPermissionInApp}
                        >
                          🔔 Дозволити сповіщення
                        </button>
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => requestMediaPermissionInApp('microphone')}
                        >
                          🎤 Дозволити мікрофон
                        </button>
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => requestMediaPermissionInApp('camera')}
                        >
                          🎥 Дозволити камеру
                        </button>
                      </div>
                    </div>
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
          <section className="user-profile-page tg-scroll-section">
            <header className="user-profile-header tg-header">
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
              <Avatar
                className="user-profile-avatar"
                photoURL={viewedProfile.photoURL}
                frame={viewedProfile.activePersonalization?.avatarFrame}
              />
              <h1>{viewedProfile.name || 'Користувач'}</h1>
              <p className="user-profile-email">
                {viewedProfile.username || '@user'} · {viewedProfile.email}
              </p>
              {viewedProfile.activePersonalization?.customStatus && (
                <p className="group-member-pill">
                  {viewedProfile.activePersonalization.customStatus}
                </p>
              )}
              <p className="presence-text">
                {viewedProfile.isOnline
                  ? '🟢 У мережі'
                  : `Був(ла) у мережі: ${lastSeenText(viewedProfile.lastSeen)}`}
              </p>
              <p className="settings-muted">
                ⚡ Карма: {viewedProfile.karma || 0} · 👥 Підписників:{' '}
                {viewedProfile.followersCount || 0} · 🎁 Подарунків:{' '}
                {(viewedProfile.gifts || []).length}
              </p>
              <div className="user-profile-about">
                <h3>Про себе</h3>
                <p>
                  {viewedProfile.about || 'Користувач ще нічого не розповів про себе.'}
                </p>
              </div>

              <div className="sidebar-tools">
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
                  ✉ Написати
                </button>
                <button
                  type="button"
                  className="tool-chip"
                  onClick={() => toggleFollowUser(viewProfileUid)}
                >
                  {myFollowing.includes(viewProfileUid) ? '✓ Підписаний' : '+ Підписатися'}
                </button>
                <button
                  type="button"
                  className="tool-chip"
                  onClick={() => toggleBlockUser(viewProfileUid)}
                >
                  {myBlockedUsers.includes(viewProfileUid) ? 'Розблокувати' : '🚫 Заблокувати'}
                </button>
              </div>

              <div className="group-creator">
                <span className="settings-muted">Підтримати автора зірками:</span>
                <div className="sidebar-tools">
                  {GIFTS_CATALOG.slice(0, 3).map(g => (
                    <button
                      type="button"
                      key={g.id}
                      className="tool-chip"
                      onClick={() => sendGiftToUser(g, viewProfileUid)}
                    >
                      {g.icon} {g.name} ({g.price}⭐)
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : mainSection === 'feed' ? (
          <section className="settings-page tg-scroll-section">
            <header className="settings-header tg-header">
              <div>
                <h1>📰 Стрічка NovaChat</h1>
                <p>Публікації, репости, опитування, активність друзів та підтримка авторів</p>
              </div>
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => {
                  setMainSection('chats')
                  setMobileChatOpen(false)
                }}
              >
                ←
              </button>
            </header>

            <div className="tg-section-body">
              {friendActivities.length > 0 && (
                <div className="settings-form">
                  <h3>⚡ Активність друзів</h3>
                  {friendActivities.slice(0, 5).map(act => (
                    <div key={act.id} className="reel-comment-item">
                      <b>{act.friendName}</b> <span>{act.label}</span>
                    </div>
                  ))}
                </div>
              )}

              <form className="settings-form" onSubmit={createPost}>
                <h3>Нова публікація</h3>
                <input
                  value={postTitle}
                  onChange={e => setPostTitle(e.target.value)}
                  placeholder="Заголовок допису або запитання..."
                  required
                />
                <textarea
                  value={postBody}
                  onChange={e => setPostBody(e.target.value)}
                  placeholder="Текст публікації або думка для обговорення..."
                  rows="3"
                  required
                />
                <div className="sidebar-tools">
                  <select
                    value={postCommunityId}
                    onChange={e => setPostCommunityId(e.target.value)}
                  >
                    {communities.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="tool-chip"
                    onClick={() => postMediaInputRef.current?.click()}
                  >
                    {postMediaFile ? `📎 ${postMediaFile.name}` : '🖼 Фото / Відео'}
                  </button>
                  <input
                    ref={postMediaInputRef}
                    hidden
                    type="file"
                    accept="image/*,video/*"
                    onChange={e => setPostMediaFile(e.target.files?.[0] || null)}
                  />
                </div>

                <input
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                  placeholder="Опитування (необов'язково): запитання..."
                />
                {pollQuestion.trim() && (
                  <input
                    value={pollOptionsText}
                    onChange={e => setPollOptionsText(e.target.value)}
                    placeholder="Варіанти через кому (наприклад: Так, Ні, Подивимось)"
                  />
                )}

                <button className="auth-submit" disabled={uploading}>
                  {uploading ? 'Публікація...' : 'Опублікувати'}
                </button>
              </form>

              <div className="chat-filter-tabs tg-tabs tg-feed-filters">
                {[
                  ['new', 'Нові'],
                  ['top', 'Популярні'],
                  ['saved', 'Збережені']
                ].map(([key, label]) => (
                  <button
                    type="button"
                    key={key}
                    className={postSort === key ? 'active' : ''}
                    onClick={() => setPostSort(key)}
                  >
                    {label}
                  </button>
                ))}
                <select
                  value={postCommunityFilter}
                  onChange={e => setPostCommunityFilter(e.target.value)}
                >
                  <option value="all">Усі спільноти</option>
                  {communities.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {visiblePosts.map(post => {
                const upCount = (post.upvotes || []).length
                const downCount = (post.downvotes || []).length
                const score = upCount - downCount
                const isSaved = mySavedPosts.includes(post.id)

                return (
                  <article key={post.id} className="user-profile-card tg-post-card">
                    <div className="group-info-head">
                      <div className="tg-post-meta">
                        <strong>{post.authorName || 'Користувач'}</strong>{' '}
                        <small>{post.authorUsername || '@user'}</small>
                        <span className="group-member-pill">{post.communityName || 'Спільнота'}</span>
                        {post.repostOf && (
                          <span className="group-member-pill">
                            🔁 Репост @{post.repostOf.originalAuthorName}
                          </span>
                        )}
                      </div>
                      <div className="sidebar-tools">
                        <span className="group-member-pill">👁 {post.viewsCount || 0}</span>
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => toggleSavePost(post.id)}
                        >
                          {isSaved ? '🔖 Збережено' : '📑 Зберегти'}
                        </button>
                      </div>
                    </div>

                    <h3>{post.title}</h3>
                    <p>{post.body}</p>

                    {post.mediaUrl && post.mediaType === 'image' && (
                      <img
                        className="message-media"
                        src={post.mediaUrl}
                        alt={post.title}
                        loading="lazy"
                      />
                    )}
                    {post.mediaUrl && post.mediaType === 'video' && (
                      <video
                        className="message-media"
                        src={post.mediaUrl}
                        controls
                        playsInline
                      />
                    )}

                    {post.poll?.question && (
                      <div className="group-creator">
                        <strong>📊 {post.poll.question}</strong>
                        {(post.poll.options || []).map(opt => {
                          const votesCount = (opt.votes || []).length
                          const voted = (opt.votes || []).includes(user.uid)
                          return (
                            <button
                              type="button"
                              key={opt.id}
                              className={`tool-chip ${voted ? 'active-chip' : ''}`}
                              onClick={() => votePoll(post, opt.id)}
                            >
                              {opt.label} — {votesCount} голосів
                            </button>
                          )
                        })}
                      </div>
                    )}

                    <div className="sidebar-tools">
                      <button
                        type="button"
                        className={`tool-chip ${(post.upvotes || []).includes(user.uid) ? 'active-chip' : ''}`}
                        onClick={() => votePost(post, 1)}
                      >
                        ▲ За ({upCount})
                      </button>
                      <span className="group-member-pill">Рейтинг: {score}</span>
                      <button
                        type="button"
                        className={`tool-chip ${(post.downvotes || []).includes(user.uid) ? 'active-chip' : ''}`}
                        onClick={() => votePost(post, -1)}
                      >
                        ▼ Проти ({downCount})
                      </button>
                      <button
                        type="button"
                        className="tool-chip"
                        onClick={() =>
                          setRepostTargetId(repostTargetId === post.id ? null : post.id)
                        }
                      >
                        🔁 Репост ({post.repostsCount || 0})
                      </button>
                      {post.authorId !== user.uid && (
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => sendGiftToUser(GIFTS_CATALOG[0], post.authorId, post.id)}
                        >
                          ⭐ Підтримати ({post.starsReceived || 0} ⭐)
                        </button>
                      )}
                      <button
                        type="button"
                        className="tool-chip"
                        onClick={() =>
                          reportTarget({
                            targetType: 'post',
                            targetId: post.id,
                            targetUserId: post.authorId
                          })
                        }
                      >
                        🚩 Скарга
                      </button>
                    </div>

                    {repostTargetId === post.id && (
                      <div className="group-creator">
                        <strong>Куди поширити публікацію?</strong>
                        <div className="sidebar-tools">
                          <button
                            type="button"
                            className="tool-chip active-chip"
                            onClick={() => repostPostToFeed(post)}
                          >
                            📰 У мою стрічку
                          </button>
                          {chats.slice(0, 4).map(c => (
                            <button
                              type="button"
                              key={c.id}
                              className="tool-chip"
                              onClick={() => sharePostToChat(post, c.id)}
                            >
                              ✉ {c.name || 'Чат'}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="sidebar-tools">
                      {POST_REACTIONS.map(emoji => {
                        const list = (post.reactions || {})[emoji] || []
                        return (
                          <button
                            type="button"
                            key={emoji}
                            className={`tool-chip ${list.includes(user.uid) ? 'active-chip' : ''}`}
                            onClick={() => reactToPost(post, emoji)}
                          >
                            {emoji} {list.length || ''}
                          </button>
                        )
                      })}
                    </div>

                    <div className="reel-comments-list">
                      {(post.comments || []).map(c => (
                        <div key={c.id} className="reel-comment-item">
                          <b>{c.authorName}:</b>{' '}
                          {c.parentAuthor && <em>@{c.parentAuthor} </em>}
                          <span>{c.text}</span>{' '}
                          <button
                            type="button"
                            className="tool-chip"
                            onClick={() =>
                              setReplyTargetComment(prev => ({ ...prev, [post.id]: c }))
                            }
                          >
                            Відповісти
                          </button>
                        </div>
                      ))}
                    </div>

                    {replyTargetComment[post.id] && (
                      <div className="reply-compose">
                        <span>
                          Відповідь <b>{replyTargetComment[post.id].authorName}</b>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setReplyTargetComment(prev => ({ ...prev, [post.id]: null }))
                          }
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    <div className="reel-comment-form">
                      <input
                        value={commentDrafts[post.id] || ''}
                        onChange={e =>
                          setCommentDrafts(prev => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="Написати коментар..."
                      />
                      <button type="button" onClick={() => addPostComment(post)}>
                        ➤
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        ) : mainSection === 'communities' ? (
          <section className="settings-page tg-scroll-section">
            <header className="settings-header tg-header">
              <div>
                <h1>👥 Спільноти NovaChat</h1>
                <p>Тематичні групи, правила, відкритий/закритий формат та стрічки</p>
              </div>
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => {
                  setSelectedCommunityId(null)
                  setMainSection('chats')
                  setMobileChatOpen(false)
                }}
              >
                ←
              </button>
            </header>

            <div className="tg-section-body">
              {selectedCommunityId ? (() => {
                const selectedComm =
                  communities.find(c => c.id === selectedCommunityId) || null

                if (!selectedComm) {
                  return (
                    <div className="user-profile-card">
                      <h3>Спільноту не знайдено</h3>
                      <button
                        type="button"
                        className="tool-chip"
                        onClick={() => setSelectedCommunityId(null)}
                      >
                        ← До списку спільнот
                      </button>
                    </div>
                  )
                }

                const joined = myJoinedCommunities.includes(selectedComm.id)
                const isOwner = selectedComm.ownerId === user.uid
                const commPosts = posts.filter(p => p.communityId === selectedComm.id)

                return (
                  <>
                    <div className="user-profile-card">
                      <div className="group-info-head">
                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => setSelectedCommunityId(null)}
                        >
                          ← Усі спільноти
                        </button>
                        <span className="group-member-pill">
                          {selectedComm.isPrivate ? '🔒 Закрита' : '🌐 Відкрита'}
                        </span>
                      </div>

                      <h2>
                        {selectedComm.name}{' '}
                        <span className="group-member-pill">{selectedComm.category}</span>
                      </h2>

                      <p>{selectedComm.description || 'Тематична спільнота NovaChat.'}</p>

                      <div className="user-profile-about">
                        <h3>Правила спільноти</h3>
                        <p>
                          {selectedComm.rules ||
                            'Будьте ввічливими та дотримуйтесь правил спільноти.'}
                        </p>
                      </div>

                      <div className="group-members-list">
                        <span className="group-member-pill">
                          👥 Учасників: {selectedComm.membersCount ?? 1}
                        </span>
                        <span className="group-member-pill">
                          📰 Публікацій: {commPosts.length}
                        </span>
                        {isOwner && (
                          <span className="group-member-pill">👑 Ви власник</span>
                        )}
                      </div>

                      <div className="sidebar-tools">
                        <button
                          type="button"
                          className={`tool-chip ${joined ? 'active-chip' : ''}`}
                          onClick={() => toggleJoinCommunity(selectedComm.id)}
                        >
                          {joined ? '✓ Підписаний' : '+ Підписатися'}
                        </button>

                        <button
                          type="button"
                          className="tool-chip"
                          onClick={() => {
                            setPostCommunityFilter(selectedComm.id)
                            setPostCommunityId(selectedComm.id)
                            setSelectedCommunityId(null)
                            setMainSection('feed')
                          }}
                        >
                          📰 Перейти до дописів
                        </button>

                        {isOwner && (
                          <button
                            type="button"
                            className="danger-settings-button"
                            onClick={async () => {
                              if (!window.confirm('Видалити цю спільноту?')) return
                              try {
                                await deleteDoc(doc(db, 'communities', selectedComm.id))
                                setSelectedCommunityId(null)
                              } catch (err) {
                                console.error(err)
                                setError('Не вдалося видалити спільноту.')
                              }
                            }}
                          >
                            🗑 Видалити спільноту
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="settings-form">
                      <h3>Останні публікації в спільноті ({commPosts.length})</h3>
                      {commPosts.length ? (
                        commPosts.map(p => (
                          <div key={p.id} className="reel-comment-item">
                            <b>{p.title}</b> — <span>{p.authorName || 'Користувач'}</span>
                          </div>
                        ))
                      ) : (
                        <p className="settings-muted">
                          У цій спільноті ще немає публікацій.
                        </p>
                      )}
                    </div>
                  </>
                )
              })() : (
                <>
                  <form className="settings-form" onSubmit={createCommunity}>
                    <h3>Створити спільноту</h3>
                    <input
                      value={newCommName}
                      onChange={e => setNewCommName(e.target.value)}
                      placeholder="Назва спільноти..."
                      required
                    />
                    <select
                      value={newCommCategory}
                      onChange={e => setNewCommCategory(e.target.value)}
                    >
                      <option value="Технології">Технології</option>
                      <option value="Ігри">Ігри</option>
                      <option value="Навчання">Навчання</option>
                      <option value="Автомобілі">Автомобілі</option>
                      <option value="Музика">Музика</option>
                    </select>
                    <input
                      value={newCommDesc}
                      onChange={e => setNewCommDesc(e.target.value)}
                      placeholder="Короткий опис..."
                    />
                    <input
                      value={newCommRules}
                      onChange={e => setNewCommRules(e.target.value)}
                      placeholder="Правила спільноти..."
                    />
                    <label className="settings-toggle">
                      <span>
                        <strong>Закрита спільнота</strong>
                        <small>Обмежений доступ для учасників</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={newCommPrivate}
                        onChange={e => setNewCommPrivate(e.target.checked)}
                      />
                    </label>
                    <button className="auth-submit" type="submit">
                      Створити спільноту
                    </button>
                  </form>

                  <div className="sidebar-tools">
                    <button
                      type="button"
                      className={`tool-chip ${!onlyMyCommunities ? 'active-chip' : ''}`}
                      onClick={() => setOnlyMyCommunities(false)}
                    >
                      Усі спільноти ({communities.length})
                    </button>
                    <button
                      type="button"
                      className={`tool-chip ${onlyMyCommunities ? 'active-chip' : ''}`}
                      onClick={() => setOnlyMyCommunities(true)}
                    >
                      Мої створені ({communities.filter(c => c.ownerId === user.uid).length})
                    </button>
                  </div>

                  {(onlyMyCommunities
                    ? communities.filter(c => c.ownerId === user.uid)
                    : communities
                  ).map(comm => {
                    const joined = myJoinedCommunities.includes(comm.id)
                    const isOwner = comm.ownerId === user.uid

                    return (
                      <div key={comm.id} className="user-profile-card tg-community-card">
                        <div className="group-info-head">
                          <div className="tg-comm-title-row">
                            <strong>{comm.name}</strong>
                            <span className="group-member-pill">{comm.category}</span>
                            {isOwner && (
                              <span className="group-member-pill">👑 Моя</span>
                            )}
                          </div>
                          <span className="group-member-pill">
                            {comm.isPrivate ? '🔒 Закрита' : '🌐 Відкрита'}
                          </span>
                        </div>
                        <p>{comm.description}</p>
                        <p className="settings-muted">Правила: {comm.rules}</p>
                        <div className="sidebar-tools">
                          <button
                            type="button"
                            className="tool-chip"
                            onClick={() => setSelectedCommunityId(comm.id)}
                          >
                            👁 Переглянути
                          </button>
                          <button
                            type="button"
                            className={`tool-chip ${joined ? 'active-chip' : ''}`}
                            onClick={() => toggleJoinCommunity(comm.id)}
                          >
                            {joined ? '✓ Підписаний' : '+ Підписатися'}
                          </button>
                          <button
                            type="button"
                            className="tool-chip"
                            onClick={() => {
                              setPostCommunityFilter(comm.id)
                              setPostCommunityId(comm.id)
                              setMainSection('feed')
                            }}
                          >
                            📰 Дописи спільноти
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {onlyMyCommunities &&
                    communities.filter(c => c.ownerId === user.uid).length === 0 && (
                      <div className="user-profile-card">
                        <p className="settings-muted">
                          Ви ще не створили жодної власної спільноти. Заповніть форму вище, щоб створити першу.
                        </p>
                      </div>
                    )}
                </>
              )}
            </div>
          </section>
        ) : mainSection === 'ai' ? (
          <section className="settings-page tg-ai-page tg-scroll-section">
            <header className="settings-header tg-header">
              <div>
                <h1>🤖 Nova AI</h1>
                <p>Відповіді на запитання, пояснення навчальних тем і чернетки для чатів</p>
              </div>
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => {
                  setMainSection('chats')
                  setMobileChatOpen(false)
                }}
              >
                ←
              </button>
            </header>

            <div className="sidebar-tools">
              {[
                ['answer', '💡 Відповідь'],
                ['study', '📚 Навчання'],
                ['draft', '✉ Чернетка']
              ].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={`tool-chip ${aiMode === key ? 'active-chip' : ''}`}
                  onClick={() => setAiMode(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="tg-ai-stream">
              {aiHistory.map(item => (
                <div
                  key={item.id}
                  className={`tg-ai-bubble ${item.role === 'user' ? 'mine' : 'assistant'}`}
                >
                  <div className="tg-ai-role">
                    {item.role === 'user' ? 'Ви' : '🤖 Nova AI'}
                  </div>
                  <FormattedAiText text={item.text} />
                  {item.role === 'assistant' && activeId && (
                    <div className="sidebar-tools">
                      <button
                        type="button"
                        className="tool-chip"
                        onClick={() => {
                          setMessage(item.text.replace(/\*\*/g, ''))
                          setMainSection('chats')
                          setMobileChatOpen(true)
                        }}
                      >
                        💬 Вставити в активний чат
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form onSubmit={handleAskNovaAi} className="reel-comment-form tg-ai-form">
              <input
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Запитай Nova AI або введи тему..."
              />
              <button type="submit" disabled={!aiPrompt.trim()}>
                ➤
              </button>
            </form>
          </section>
        ) : mainSection === 'stars' ? (
          <section className="settings-page tg-stars-page tg-scroll-section">
            <header className="settings-header tg-header">
              <div>
                <h1>⭐ NovaStars, 🎨 Персоналізація та 💛 Підтримка</h1>
                <p>Баланс: {myStars} ⭐ · Карма: {myKarma}</p>
              </div>
              <button
                type="button"
                className="mobile-back-button"
                onClick={() => {
                  setMainSection('chats')
                  setMobileChatOpen(false)
                }}
              >
                ←
              </button>
            </header>

            <div className="tg-section-body">
              <div className="settings-form">
                <h3>Поповнити NovaStars</h3>
                <div className="sidebar-tools">
                  {STAR_PACKS.map(pack => (
                    <button
                      type="button"
                      key={pack.id}
                      className="auth-submit"
                      onClick={() => buyStarPack(pack)}
                    >
                      Купити {pack.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-form">
                <h3>🎨 Персоналізація за NovaStars</h3>
                <div className="tg-pers-list">
                  {PERSONALIZATION_ITEMS.map(item => {
                    const owned = ownedItems.includes(item.id)
                    const equipped = activePersonalization[item.category] === item.value
                    return (
                      <div key={item.id} className="tg-pers-card">
                        <div className="tg-pers-preview-row">
                          <span
                            className="tg-pers-swatch"
                            style={{ background: item.preview }}
                          />
                          <div className="tg-pers-meta">
                            <strong>{item.title}</strong>
                            <small className="settings-muted">{item.categoryLabel}</small>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`tool-chip ${equipped ? 'active-chip' : ''}`}
                          onClick={() => handlePersonalizationItem(item)}
                        >
                          {equipped
                            ? '✓ Активно'
                            : owned
                              ? 'Вдягнути'
                              : `Купити (${item.price} ⭐)`}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="settings-form">
                <h3>💛 Авторська підтримка</h3>
                <p className="settings-muted">
                  Отримано зірок: <b>{supportStats.totalStarsReceived || 0} ⭐</b> · Підтримувачів:{' '}
                  <b>{supportStats.supportersCount || 0}</b>
                </p>

                {(supportStats.topSupporters || []).length > 0 && (
                  <div className="group-members-list">
                    {(supportStats.topSupporters || []).map(sup => (
                      <span key={sup.uid} className="group-member-pill">
                        🏆 {sup.name}: {sup.stars} ⭐
                      </span>
                    ))}
                  </div>
                )}

                <div className="tg-support-controls">
                  <select
                    value={giftRecipientUid}
                    onChange={e => setGiftRecipientUid(e.target.value)}
                  >
                    <option value="">Обери автора...</option>
                    {knownUsersList.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.name || 'Користувач'} ({u.username || u.email})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="5"
                    max="1000"
                    value={supportAmount}
                    onChange={e => setSupportAmount(Number(e.target.value) || 10)}
                    placeholder="Кількість ⭐"
                  />
                  <button
                    type="button"
                    className="tool-chip active-chip"
                    onClick={() =>
                      sendGiftToUser(
                        {
                          id: 'support',
                          name: 'Підтримка',
                          icon: '💛',
                          price: supportAmount,
                          rarity: 'Підтримка'
                        },
                        giftRecipientUid,
                        null,
                        supportAmount
                      )
                    }
                  >
                    Підтримати ({supportAmount} ⭐)
                  </button>
                </div>

                <div className="sidebar-tools">
                  {GIFTS_CATALOG.map(gift => (
                    <button
                      type="button"
                      key={gift.id}
                      className="tool-chip"
                      onClick={() => sendGiftToUser(gift, giftRecipientUid)}
                    >
                      {gift.icon} {gift.name} — {gift.price} ⭐ ({gift.rarity})
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-form">
                <h3>🎁 Моя колекція подарунків ({myGifts.length})</h3>
                <div className="group-members-list">
                  {myGifts.length ? (
                    myGifts.map((g, idx) => (
                      <span key={g.id || idx} className="group-member-pill">
                        {g.icon} {g.name} ({g.price} ⭐) · від {g.fromName}
                      </span>
                    ))
                  ) : (
                    <span className="settings-muted">Поки немає отриманих подарунків.</span>
                  )}
                </div>
              </div>

              <div className="settings-form">
                <h3>Історія транзакцій NovaStars</h3>
                <div className="tg-tx-list">
                  {starTransactions.map(tx => (
                    <div key={tx.id} className="tg-tx-row">
                      <span>{tx.title}</span>
                      <strong>
                        {tx.delta >= 0 ? `+${tx.delta}` : tx.delta} ⭐
                      </strong>
                    </div>
                  ))}
                  {!starTransactions.length && (
                    <p className="settings-muted">Транзакцій поки немає.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        ) : activeChat ? (
          <>
            <header className="chat-header tg-header">
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
                  frame={activeProfile.activePersonalization?.avatarFrame}
                  fallback={activeChat.isGroup ? '👥' : '👤'}
                />
                <span className="header-info">
                  <strong>{activeName}</strong>
                  <span className={activeProfile.isOnline ? 'status-online' : 'status-offline'}>
                    {activeChat.isGroup
                      ? `${participantIds.length} учасників`
                      : activeProfile.isOnline
                        ? '🟢 у мережі'
                        : `був(ла) ${lastSeenText(activeProfile.lastSeen)}`}
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

            {scheduledMessages.filter(s => s.chatId === activeId && s.status === 'pending').length >
              0 && (
              <div className="pinned-banner">
                <span>
                  ⏰ Відкладених повідомлень у чаті:{' '}
                  <b>
                    {
                      scheduledMessages.filter(s => s.chatId === activeId && s.status === 'pending')
                        .length
                    }
                  </b>
                  {scheduledMessages
                    .filter(s => s.chatId === activeId && s.status === 'pending')
                    .map(s => (
                      <span key={s.id} style={{ marginLeft: 8 }}>
                        «{s.text.slice(0, 24)}» (
                        {new Date(s.sendAtMs).toLocaleTimeString('uk-UA', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                        )
                        <button
                          type="button"
                          onClick={() => cancelScheduledMessage(s.id)}
                          style={{ marginLeft: 4 }}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                </span>
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

            <section
              className={`messages tg-messages ${
                activePersonalization.chatBg === 'midnight'
                  ? 'chat-bg-midnight'
                  : activePersonalization.chatBg === 'aurora'
                    ? 'chat-bg-aurora'
                    : ''
              }`}
            >
              {filteredMessages.map(msg => {
                const mine = msg.senderId === user.uid
                const isEditing = editingMessage?.id === msg.id
                const seenByOthers = activeChat.isGroup
                  ? otherUids.length > 0 &&
                    otherUids.every(uid => (msg.readBy || []).includes(uid))
                  : Boolean(
                      msg.read ||
                        (otherUid && (msg.readBy || []).includes(otherUid))
                    )

                return (
                  <div key={msg.id} className={`message-row ${mine ? 'mine' : ''}`}>
                    <div className="message-bubble tg-bubble">
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

                          <div className="tg-bubble-body">
                            {msg.text && <span className="message-text">{msg.text}</span>}
                            {msg.edited && <small className="edited-label">ред.</small>}
                            <span className="message-time tg-inline-time">
                              {timeText(msg.createdAt)}
                              {mine && (
                                <span
                                  className={`read-ticks ${seenByOthers ? 'seen' : ''}`}
                                  title={seenByOthers ? 'Побачено' : 'Надіслано'}
                                >
                                  {seenByOthers ? ' ✓✓' : ' ✓'}
                                </span>
                              )}
                            </span>
                          </div>
                        </>
                      )}

                      <div className="message-actions tg-msg-toolbar">
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

            {scheduleEnabled && (
              <div className="reply-compose">
                <span>
                  ⏰ Час відправлення:{' '}
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={e => setScheduleAt(e.target.value)}
                  />
                </span>
                <button type="button" onClick={() => setScheduleEnabled(false)}>
                  ✕
                </button>
              </div>
            )}

            <form className="message-form tg-input-bar" onSubmit={sendMessage}>
              <button
                type="button"
                className="attach-button"
                title="Фото, відео або файл"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || recording}
              >
                ＋
              </button>
              <button
                type="button"
                className={`attach-button ${scheduleEnabled ? 'active-chip' : ''}`}
                title="Відкладене повідомлення"
                onClick={() => setScheduleEnabled(v => !v)}
                disabled={uploading || recording}
              >
                ⏰
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
                    : scheduleEnabled
                      ? 'Напиши відкладене повідомлення...'
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
                className="send-button tg-send-btn"
                disabled={!message.trim() || uploading || recording}
              >
                {scheduleEnabled ? '⏰' : '➤'}
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
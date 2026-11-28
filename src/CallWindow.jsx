import { useEffect, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore'
import { db } from './firebase.js'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
}

export default function CallWindow({
  user,
  callId,
  peerId,
  peerName,
  callType = 'audio',
  isCaller,
  onClose
}) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const peerConnectionRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const processedSignalsRef = useRef(new Set())
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)

  const [status, setStatus] = useState('Підключення...')
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(callType !== 'video')

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let unsubscribeSignals = null
    let unsubscribeCall = null
    let disposed = false

    closingRef.current = false
    processedSignalsRef.current.clear()
    pendingCandidatesRef.current = []

    const closeLocalResources = () => {
      if (disposed) return
      disposed = true

      if (unsubscribeSignals) {
        unsubscribeSignals()
        unsubscribeSignals = null
      }
      if (unsubscribeCall) {
        unsubscribeCall()
        unsubscribeCall = null
      }

      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null
        peerConnectionRef.current.onicecandidate = null
        peerConnectionRef.current.onconnectionstatechange = null
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }

      localStreamRef.current?.getTracks().forEach(track => track.stop())
      remoteStreamRef.current?.getTracks().forEach(track => track.stop())

      localStreamRef.current = null
      remoteStreamRef.current = null
    }

    const finishCall = async (updateServer = true) => {
      if (closingRef.current) return
      closingRef.current = true

      if (updateServer && callId) {
        try {
          await updateDoc(doc(db, 'calls', callId), {
            status: 'ended',
            endedAt: serverTimestamp()
          })
        } catch (err) {
          console.error('Завершення дзвінка:', err)
        }
      }

      closeLocalResources()
      onCloseRef.current?.()
    }

    const sendSignal = async data => {
      if (!callId || !user?.uid || !peerId) return
      await addDoc(collection(db, 'calls', callId, 'signals'), {
        ...data,
        from: user.uid,
        to: peerId,
        createdAt: serverTimestamp()
      })
    }

    const flushPendingCandidates = async pc => {
      const candidates = [...pendingCandidatesRef.current]
      pendingCandidatesRef.current = []

      for (const candidate of candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('ICE candidate:', err)
        }
      }
    }

    const startCall = async () => {
      try {
        setError('')

        if (!callId || !user?.uid || !peerId) {
          throw new Error('Некоректні дані дзвінка.')
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Браузер не підтримує доступ до камери або мікрофона. Відкрий сайт через HTTPS або localhost.'
          )
        }

        setStatus('Запит доступу до пристроїв...')

        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video:
              callType === 'video'
                ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
                : false
          })
        } catch (mediaErr) {
          if (callType === 'video') {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            })
            setCameraOff(true)
            setError('Камера недоступна — увімкнено лише мікрофон.')
          } else {
            throw mediaErr
          }
        }

        if (disposed) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        localStreamRef.current = stream

        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = stream
        }

        const pc = new RTCPeerConnection(ICE_SERVERS)
        peerConnectionRef.current = pc

        const remoteStream = new MediaStream()
        remoteStreamRef.current = remoteStream

        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream
        }

        stream.getTracks().forEach(track => {
          pc.addTrack(track, stream)
        })

        pc.ontrack = event => {
          event.streams[0]?.getTracks().forEach(track => {
            const exists = remoteStream.getTracks().some(item => item.id === track.id)
            if (!exists) {
              remoteStream.addTrack(track)
            }
          })

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream
            remoteVideoRef.current.play?.().catch(() => {})
          }
        }

        pc.onicecandidate = event => {
          if (event.candidate && !disposed) {
            sendSignal({
              type: 'candidate',
              candidate: event.candidate.toJSON()
            }).catch(err => {
              console.error('Надсилання ICE candidate:', err)
            })
          }
        }

        pc.onconnectionstatechange = () => {
          if (disposed) return

          if (pc.connectionState === 'connected') {
            setStatus('З’єднання встановлено')
            updateDoc(doc(db, 'calls', callId), { status: 'active' }).catch(() => {})
          } else if (pc.connectionState === 'connecting') {
            setStatus('З’єднання встановлюється...')
          } else if (
            pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected'
          ) {
            setStatus('З’єднання перервано')
          }
        }

        unsubscribeCall = onSnapshot(
          doc(db, 'calls', callId),
          snapshot => {
            if (closingRef.current) return

            if (!snapshot.exists()) {
              finishCall(false)
              return
            }

            const data = snapshot.data()
            if (data.status === 'ended') {
              finishCall(false)
            } else if (
              data.status === 'accepted' &&
              isCaller &&
              pc.connectionState !== 'connected'
            ) {
              setStatus('З’єднання встановлюється...')
            }
          },
          err => {
            console.error('Статус дзвінка:', err)
            setError('Не вдалося перевірити статус дзвінка у Firestore.')
          }
        )

        const signalsQuery = query(
          collection(db, 'calls', callId, 'signals'),
          where('to', '==', user.uid)
        )

        unsubscribeSignals = onSnapshot(
          signalsQuery,
          async snapshot => {
            for (const change of snapshot.docChanges()) {
              if (change.type !== 'added') continue

              const signalId = change.doc.id
              if (processedSignalsRef.current.has(signalId)) continue
              processedSignalsRef.current.add(signalId)

              const signal = change.doc.data()

              try {
                if (signal.type === 'offer' && !isCaller) {
                  if (pc.remoteDescription) continue

                  await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                  await flushPendingCandidates(pc)

                  const answer = await pc.createAnswer()
                  await pc.setLocalDescription(answer)

                  await sendSignal({
                    type: 'answer',
                    sdp: { type: answer.type, sdp: answer.sdp }
                  })

                  setStatus('З’єднання встановлюється...')
                }

                if (signal.type === 'answer' && isCaller) {
                  if (!pc.currentRemoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
                    await flushPendingCandidates(pc)
                    setStatus('З’єднання встановлюється...')
                  }
                }

                if (signal.type === 'candidate' && signal.candidate) {
                  if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
                  } else {
                    pendingCandidatesRef.current.push(signal.candidate)
                  }
                }
              } catch (err) {
                console.error('Обробка сигналу:', err)
                setError('Помилка обміну WebRTC-сигналами.')
              }
            }
          },
          err => {
            console.error('Підписка на сигнали:', err)
            setError('Немає доступу до сигналів дзвінка (перевір правила Firestore).')
          }
        )

        if (isCaller) {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          await sendSignal({
            type: 'offer',
            sdp: { type: offer.type, sdp: offer.sdp }
          })

          setStatus('Виклик надсилається...')
        } else {
          setStatus('Підключення до розмови...')
        }
      } catch (err) {
        console.error('Помилка дзвінка:', err)
        setStatus('Помилка підключення')
        setError(
          err.name === 'NotAllowedError'
            ? 'Немає дозволу на камеру або мікрофон. Перевір дозволи браузера/пристрою.'
            : err.message || 'Не вдалося запустити дзвінок.'
        )
      }
    }

    startCall()

    return () => {
      closeLocalResources()
    }
  }, [callId, user?.uid, peerId, callType, isCaller])

  function toggleMicrophone() {
    const stream = localStreamRef.current
    if (!stream) return

    const nextValue = !muted
    stream.getAudioTracks().forEach(track => {
      track.enabled = !nextValue
    })
    setMuted(nextValue)
  }

  function toggleCamera() {
    const stream = localStreamRef.current
    if (!stream) return

    const videoTracks = stream.getVideoTracks()
    if (!videoTracks.length) return

    const nextValue = !cameraOff
    videoTracks.forEach(track => {
      track.enabled = !nextValue
    })
    setCameraOff(nextValue)
  }

  async function hangUp() {
    if (closingRef.current) return
    closingRef.current = true

    if (callId) {
      try {
        await updateDoc(doc(db, 'calls', callId), {
          status: 'ended',
          endedAt: serverTimestamp()
        })
      } catch (err) {
        console.error('Завершення дзвінка:', err)
      }
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    remoteStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    remoteStreamRef.current = null

    onCloseRef.current?.()
  }

  const isConnected = status === 'З’єднання встановлено'
  const isCalling = !isConnected && !error
  const initialLetter = (peerName || 'К').trim().charAt(0).toUpperCase()

  return (
    <div className="call-overlay">
      <div className={`call-card ${callType === 'video' ? 'video-mode' : ''}`}>
        <div className="call-header-info">
          <h2 className="call-peer-name">{peerName || 'Користувач'}</h2>
          <p className={`call-status-text ${isConnected ? 'connected' : ''}`}>
            {status}
          </p>
        </div>

        {callType === 'video' ? (
          <div className="video-call-stage">
            <video
              ref={remoteVideoRef}
              className="remote-video"
              autoPlay
              playsInline
            />

            <video
              ref={localVideoRef}
              className="local-video-pip"
              autoPlay
              muted
              playsInline
            />
          </div>
        ) : (
          <>
            <div className={`call-avatar-ring ${isCalling ? 'calling' : ''}`}>
              <div className="call-avatar-inner">
                {initialLetter}
              </div>
            </div>
            <audio
              ref={remoteVideoRef}
              autoPlay
            />
          </>
        )}

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <div className="call-controls">
          <button
            type="button"
            className={`call-btn ${muted ? 'muted' : ''}`}
            onClick={toggleMicrophone}
            title={muted ? 'Увімкнути мікрофон' : 'Вимкнути мікрофон'}
          >
            <span>{muted ? '🔇' : '🎤'}</span>
            <span>{muted ? 'Увімкнути' : 'Мікрофон'}</span>
          </button>

          {callType === 'video' && (
            <button
              type="button"
              className={`call-btn ${cameraOff ? 'active' : ''}`}
              onClick={toggleCamera}
              title={cameraOff ? 'Увімкнути камеру' : 'Вимкнути камеру'}
            >
              <span>{cameraOff ? '📷' : '🎥'}</span>
              <span>{cameraOff ? 'Увімкнути камеру' : 'Вимкнути камеру'}</span>
            </button>
          )}

          <button
            type="button"
            className="call-btn end-call"
            onClick={hangUp}
          >
            <span>☎</span>
            <span>Завершити</span>
          </button>
        </div>
      </div>
    </div>
  )
}
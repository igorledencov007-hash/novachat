
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

    const closeLocalResources = () => {
      if (disposed) return
      disposed = true

      if (unsubscribeSignals) unsubscribeSignals()
      if (unsubscribeCall) unsubscribeCall()

      peerConnectionRef.current?.close()
      peerConnectionRef.current = null

      localStreamRef.current?.getTracks().forEach(track => track.stop())
      remoteStreamRef.current?.getTracks().forEach(track => track.stop())

      localStreamRef.current = null
      remoteStreamRef.current = null
    }

    const finishCall = async (updateServer = true) => {
      if (closingRef.current) return
      closingRef.current = true

      if (updateServer) {
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
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            'Браузер не підтримує доступ до камери та мікрофона. Відкрий сайт через HTTPS або localhost.'
          )
        }

        setStatus('Запит доступу до пристроїв...')

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video'
        })

        if (disposed) {
          stream.getTracks().forEach(track => track.stop())
          return
        }

        localStreamRef.current = stream

        if (localVideoRef.current) {
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
            const exists = remoteStream.getTracks().some(
              item => item.id === track.id
            )

            if (!exists) remoteStream.addTrack(track)
          })

          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream
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

            updateDoc(doc(db, 'calls', callId), {
              status: 'active'
            }).catch(err => console.error(err))
          }

          if (
            pc.connectionState === 'failed' ||
            pc.connectionState === 'disconnected'
          ) {
            setStatus('З’єднання перервано')
          }
        }

        unsubscribeCall = onSnapshot(
          doc(db, 'calls', callId),
          snapshot => {
            if (!snapshot.exists()) {
              setError('Дзвінок більше не існує.')
              finishCall(false)
              return
            }

            if (snapshot.data().status === 'ended') {
              setStatus('Дзвінок завершено')
              finishCall(false)
            }
          },
          err => {
            console.error('Статус дзвінка:', err)
            setError('Не вдалося перевірити статус дзвінка.')
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

                  await pc.setRemoteDescription(
                    new RTCSessionDescription(signal.sdp)
                  )

                  await flushPendingCandidates(pc)

                  const answer = await pc.createAnswer()
                  await pc.setLocalDescription(answer)

                  await sendSignal({
                    type: 'answer',
                    sdp: {
                      type: answer.type,
                      sdp: answer.sdp
                    }
                  })

                  setStatus('Очікування підключення...')
                }

                if (signal.type === 'answer' && isCaller) {
                  if (!pc.currentRemoteDescription) {
                    await pc.setRemoteDescription(
                      new RTCSessionDescription(signal.sdp)
                    )

                    await flushPendingCandidates(pc)
                    setStatus('З’єднання встановлюється...')
                  }
                }

                if (signal.type === 'candidate' && signal.candidate) {
                  if (pc.remoteDescription) {
                    await pc.addIceCandidate(
                      new RTCIceCandidate(signal.candidate)
                    )
                  } else {
                    pendingCandidatesRef.current.push(signal.candidate)
                  }
                }
              } catch (err) {
                console.error('Обробка сигналу:', err)
                setError('Помилка встановлення з’єднання.')
              }
            }
          },
          err => {
            console.error('Підписка на сигнали:', err)
            setError('Не вдалося отримати сигнали дзвінка.')
          }
        )

        if (isCaller) {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          await sendSignal({
            type: 'offer',
            sdp: {
              type: offer.type,
              sdp: offer.sdp
            }
          })

          setStatus('Виклик надсилається...')
        } else {
          setStatus('Очікування відповіді співрозмовника...')
        }
      } catch (err) {
        console.error('Помилка дзвінка:', err)

        setError(
          err.name === 'NotAllowedError'
            ? 'Немає дозволу на камеру або мікрофон. Перевір налаштування браузера.'
            : err.message || 'Не вдалося запустити дзвінок.'
        )
      }
    }

    startCall()

    return () => {
      closeLocalResources()
    }
  }, [callId, user.uid, peerId, callType, isCaller])

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

    const nextValue = !cameraOff
    stream.getVideoTracks().forEach(track => {
      track.enabled = !nextValue
    })

    setCameraOff(nextValue)
  }

  async function hangUp() {
    if (closingRef.current) return
    closingRef.current = true

    try {
      await updateDoc(doc(db, 'calls', callId), {
        status: 'ended',
        endedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Завершення дзвінка:', err)
    }

    peerConnectionRef.current?.close()
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    remoteStreamRef.current?.getTracks().forEach(track => track.stop())

    onCloseRef.current?.()
  }

  return (
    <div className="call-overlay">
      <div className="call-window">
        <div className="call-top">
          <div>
            <h2>{peerName || 'Користувач'}</h2>
            <p>{status}</p>
          </div>

          <button
            type="button"
            className="call-close"
            onClick={hangUp}
            title="Завершити дзвінок"
          >
            ✕
          </button>
        </div>

        {callType === 'video' ? (
          <div className="call-videos">
            <div className="remote-video-wrap">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
              />

              <span className="video-label">
                {peerName || 'Співрозмовник'}
              </span>
            </div>

            <div className="local-video-wrap">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
              />

              {cameraOff && (
                <span className="camera-disabled">
                  Камера вимкнена
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="audio-call-content">
            <div className="call-avatar">👤</div>
            <h3>{peerName || 'Користувач'}</h3>
            <p>{status}</p>
            <audio
              ref={remoteVideoRef}
              autoPlay
            />
          </div>
        )}

        {error && (
          <div className="call-error">
            {error}
          </div>
        )}

        <div className="call-controls">
          <button
            type="button"
            onClick={toggleMicrophone}
            title={muted ? 'Увімкнути мікрофон' : 'Вимкнути мікрофон'}
          >
            {muted ? '🔇' : '🎤'}
            <span>{muted ? 'Увімкнути' : 'Мікрофон'}</span>
          </button>

          {callType === 'video' && (
            <button
              type="button"
              onClick={toggleCamera}
              title={cameraOff ? 'Увімкнути камеру' : 'Вимкнути камеру'}
            >
              {cameraOff ? '📷' : '🎥'}
              <span>{cameraOff ? 'Камера' : 'Відео'}</span>
            </button>
          )}

          <button
            type="button"
            className="hangup-button"
            onClick={hangUp}
          >
            ☎
            <span>Завершити</span>
          </button>
        </div>
      </div>
    </div>
  )
}

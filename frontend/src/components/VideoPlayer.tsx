import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'

declare module 'video.js' {
  interface VideoJsPlayer {
    vttThumbnails: (options: { src: string }) => void
  }
}

interface VideoPlayerProps {
  playbackUrl: string
  thumbnailsUrl?: string
  className?: string
}

const VideoPlayer = ({ playbackUrl, thumbnailsUrl, className = '' }: VideoPlayerProps) => {
  const videoRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)

  useEffect(() => {
    // Make sure Video.js player is only initialized once
    if (!playerRef.current && videoRef.current) {
      const videoElement = document.createElement('video-js')
      
      videoElement.classList.add('vjs-big-play-centered')
      videoRef.current.appendChild(videoElement)
      
      playerRef.current = videojs(videoElement, {
        controls: true,
        fluid: true,
        responsive: true,
        html5: {
          hls: {
            overrideNative: true,
            limitRenditionByPlayerDimensions: false,
            useDevicePixelRatio: true
          }
        }
      })
      
      // Properly encode the URLs to handle special characters like ###
      // Use a more robust encoding approach
      const encodedPlaybackUrl = playbackUrl.replace(/#/g, '%23');
      
      console.log('[StreamFlow] Original playback URL:', playbackUrl);
      console.log('[StreamFlow] Encoded playback URL:', encodedPlaybackUrl);
      
      playerRef.current.src({
        src: encodedPlaybackUrl,
        type: 'application/x-mpegURL'
      })
      
      // Add thumbnails if available
      if (thumbnailsUrl && (playerRef.current as any).vttThumbnails) {
        // Properly encode the thumbnails URL
        const encodedThumbnailsUrl = thumbnailsUrl.replace(/#/g, '%23');
        
        console.log('[StreamFlow] Original thumbnails URL:', thumbnailsUrl);
        console.log('[StreamFlow] Encoded thumbnails URL:', encodedThumbnailsUrl);
        
        (playerRef.current as any).vttThumbnails({
          src: encodedThumbnailsUrl
        })
      }
      
      // Enable progressive loading
      playerRef.current.ready(() => {
        if (playerRef.current?.tech()) {
          playerRef.current.tech().on('retryplaylist', () => {
            console.log('HLS playlist load failed, retrying...')
          })
          
          playerRef.current.tech().on('seekablechanged', () => {
            const seekable = playerRef.current?.seekable()
            if (seekable && seekable.length > 0) {
              console.log(`Seekable range: ${seekable.start(0)} - ${seekable.end(0)}`)
            }
          })
        }
      })
    }
    
    // Cleanup on unmount
    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [playbackUrl, thumbnailsUrl])

  return (
    <div data-vjs-player className={className}>
      <div ref={videoRef} className="w-full aspect-video"></div>
    </div>
  )
}

export default VideoPlayer

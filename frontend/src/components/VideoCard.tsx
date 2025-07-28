import { Link } from 'react-router-dom'
import { Video } from '../api'

interface VideoCardProps {
  video: Video
}

const VideoCard = ({ video }: VideoCardProps) => {
  return (
    <Link to={`/video/${video.id}`} className="block">
      <div className="card card-hover">
        <img 
          src={video.thumbnailUrl} 
          alt={video.title}
          className="video-thumbnail"
          loading="lazy"
        />
        <div className="p-3">
          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
            {video.title}
          </h3>
          <p className="text-sm text-gray-600">
            {video.username}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(video.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </Link>
  )
}

export default VideoCard

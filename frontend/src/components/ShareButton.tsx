import { useState } from 'react';

interface ShareButtonProps {
  videoId: string;
  title: string;
}

const ShareButton = ({ videoId, title }: ShareButtonProps) => {
  const [copied, setCopied] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  
  // Generate the shareable URL
  const shareUrl = `${window.location.origin}/video/${videoId}`;
  
  // Handle copy to clipboard
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setShowTooltip(true);
      
      // Hide the tooltip after 2 seconds
      setTimeout(() => {
        setShowTooltip(false);
        setCopied(false);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };
  
  // Handle social media sharing
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: `Check out this video: ${title}`,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
        // Fall back to copy link if sharing fails
        handleCopyLink();
      }
    } else {
      // If Web Share API is not available, copy to clipboard
      handleCopyLink();
    }
  };
  
  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className="flex items-center space-x-1 text-gray-600 hover:text-gray-900 transition"
        aria-label="Share video"
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-5 w-5" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" 
          />
        </svg>
        <span>Share</span>
      </button>
      
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap">
          Link copied!
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
};

export default ShareButton;

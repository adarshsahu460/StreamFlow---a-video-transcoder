import { useState, useEffect } from 'react';
import { fetchVideos, Video } from '../api';

interface UploadStatusProps {
  onRefresh?: () => void;
}

const UploadStatus = ({ onRefresh }: UploadStatusProps) => {
  const [pendingVideos, setPendingVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchPendingVideos = async () => {
    try {
      setLoading(true);
      const videos = await fetchVideos(true);
      // Filter only videos that are not completed
      const pending = videos.filter(v => v.status !== 'COMPLETED');
      setPendingVideos(pending);
    } catch (error) {
      console.error('Error fetching pending videos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingVideos();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      fetchPendingVideos();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // If no pending videos, don't show anything
  if (pendingVideos.length === 0) {
    return null;
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'PROCESSING':
        return 'Processing';
      case 'FAILED':
        return 'Failed';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'FAILED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden max-w-sm w-full">
        <div 
          className="bg-primary-600 text-white p-3 flex justify-between items-center cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span>Upload Status ({pendingVideos.length})</span>
          </div>
          <button className="text-white">
            {expanded ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </div>
        
        {expanded && (
          <div className="p-3">
            {loading && pendingVideos.length === 0 ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-700"></div>
              </div>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {pendingVideos.map(video => (
                  <div key={video.id} className="border border-gray-200 rounded-md p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-gray-900 truncate">{video.title}</h4>
                        <p className="text-sm text-gray-500">by {video.username}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(video.status)}`}>
                        {getStatusLabel(video.status)}
                      </span>
                    </div>
                    
                    {video.status === 'PROCESSING' && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary-600 animate-pulse" style={{ width: '80%' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="mt-3 flex justify-end">
              <button 
                onClick={() => {
                  fetchPendingVideos();
                  if (onRefresh) onRefresh();
                }}
                className="text-sm text-primary-600 hover:text-primary-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UploadStatus;

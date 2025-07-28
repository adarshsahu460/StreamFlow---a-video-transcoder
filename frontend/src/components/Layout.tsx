import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import UploadStatus from './UploadStatus'

const Layout = () => {
  const [refreshKey, setRefreshKey] = useState(0)
  
  const handleRefresh = () => {
    // Increment refresh key to trigger re-render of child components
    setRefreshKey(prevKey => prevKey + 1)
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-grow container mx-auto px-4 py-8">
        <Outlet key={refreshKey} />
      </main>
      <footer className="bg-gray-100 py-6">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© {new Date().getFullYear()} StreamFlow. All rights reserved.</p>
        </div>
      </footer>
      
      {/* Upload Status Component */}
      <UploadStatus onRefresh={handleRefresh} />
    </div>
  )
}

export default Layout

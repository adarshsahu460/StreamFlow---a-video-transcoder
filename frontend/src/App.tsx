import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import VideoPage from './pages/VideoPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="video/:id" element={<VideoPage />} />
      </Route>
    </Routes>
  )
}

export default App

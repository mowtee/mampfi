import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import EventsList from './pages/EventsList'
import EventDetail from './pages/EventDetail'
import Join from './pages/Join'
import NewEvent from './pages/NewEvent'
import './tailwind.css'
import './styles.css'

const el = document.getElementById('root')!
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: 'always',
      staleTime: 0,
    },
  },
})
createRoot(el).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<App />}> 
            <Route index element={<EventsList />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/join" element={<Join />} />
            <Route path="/events/new" element={<NewEvent />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)

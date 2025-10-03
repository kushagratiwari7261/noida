// src/App.jsx
import { useState, useEffect } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCard from './components/StatCard'
import ActiveJob from './components/ActiveJob'
import CustomerPage from './components/CustomerPage'
import Login from './components/Login'
import './App.css'
import NewShipments from './components/NewShipments'
import DSRPage from './components/DSRPage' // Import the new DSR component
import EmailArchive from './components/App1.jsx'; // Add this import

import { supabase } from './lib/supabaseClient';

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [statsData, setStatsData] = useState([])
  const [dashboardJobsData, setDashboardJobsData] = useState([])
  const [dashboardShipmentsData, setDashboardShipmentsData] = useState([])
  const navigate = useNavigate()

  // Check if user is authenticated on component mount
  useEffect(() => {
    const token = sessionStorage.getItem('authToken')
    
    // More robust token validation
    if (token && isValidToken(token)) {
      setIsAuthenticated(true)
      // Redirect to dashboard if authenticated and on login page
      if (window.location.pathname === '/login') {
        navigate('/dashboard', { replace: true })
      }
    } else {
      // Clear token if invalid
      sessionStorage.removeItem('authToken')
      setIsAuthenticated(false)
      // Redirect to login if not authenticated and trying to access protected routes
      if (window.location.pathname !== '/login') {
        navigate('/login', { replace: true })
      }
    }
    setIsLoading(false)
  }, [navigate])

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData()
    }
  }, [isAuthenticated])

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      await Promise.all([
        fetchStatsData(),
        fetchJobsData(),
        fetchShipmentsData()
      ])
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
    }
  }

  // Fetch stats data from Supabase
  const fetchStatsData = async () => {
    try {
      // Get total shipments count
      const { count: totalShipments, error: shipmentsError } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true })
      
      // Get jobs count
      const { count: jobsCount, error: jobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true })
      
      // Get invoices count (assuming you have an invoices table)
      const { count: invoicesCount, error: invoicesError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
      
      // Get messages count (assuming you have a messages table)
      const { count: messagesCount, error: messagesError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
      
      if (shipmentsError || jobsError || invoicesError || messagesError) {
        console.error('Error fetching stats:', { shipmentsError, jobsError, invoicesError, messagesError })
        // Fallback to default data
        setStatsData([
          { label: 'Total Shipments', value: '1,250', icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
          { label: 'Jobs', value: '320', icon: 'teal', id: 'Jobs', path: '/job-orders' },
          { label: 'Invoices', value: '15', icon: 'yellow', id: 'Invoices', path: '/invoices' },
          { label: 'Messages', value: '5', icon: 'red', id: 'Messages', path: '/messages' }
        ])
        return
      }
      
      // Format numbers with commas
      const formatNumber = (num) => num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0"
      
      setStatsData([
        { label: 'Total Shipments', value: formatNumber(totalShipments), icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
        { label: 'Jobs', value: formatNumber(jobsCount), icon: 'teal', id: 'Jobs', path: '/job-orders' },
        { label: 'Invoices', value: formatNumber(invoicesCount), icon: 'yellow', id: 'Invoices', path: '/invoices' },
        { label: 'Messages', value: formatNumber(messagesCount), icon: 'red', id: 'Messages', path: '/messages' }
      ])
    } catch (error) {
      console.error('Error in fetchStatsData:', error)
    }
  }

  // Fetch jobs data from Supabase - UPDATED
  const fetchJobsData = async () => {
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (error) {
        console.error('Error fetching jobs:', error)
        // Fallback to sample data
        setDashboardJobsData([
          { id: 'JOB-001', customer: 'Acme Corp', status: 'In Progress', date: '2024-07-26' },
          { id: 'JOB-002', customer: 'Global Imports', status: 'Completed', date: '2024-07-25' },
          { id: 'JOB-003', customer: 'Tech Solutions', status: 'Pending', date: '2024-07-24' }
        ])
        return
      }
      
      console.log('Jobs data from Supabase:', data); // Debug log
      
      // More flexible mapping to handle different column names
      const fetchJobs = data.map(job => ({
        id:  job.job_no || 'N/A',
        customer: job.client || 'Unknown Customer',
        status: job.status || 'Unknown',
        date: job.job_date ? new Date(job.job_date).toLocaleDateString() : 'Unknown date' 
      }))
      
      setDashboardJobsData(fetchJobs)
    } catch (error) {
      console.error('Error in fetchJobsData:', error)
    }
  }

  // Fetch shipments data from Supabase - UPDATED
  const fetchShipmentsData = async () => {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
      
      if (error) {
        console.error('Error fetching shipments:', error)
        // Fallback to sample data
        setDashboardShipmentsData([
          { id: 'SHIP-12345', destination: 'New York', status: 'In Transit', date: '2024-07-26' },
          { id: 'SHIP-67890', destination: 'Los Angeles', status: 'Delivered', date: '2024-07-25' },
          { id: 'SHIP-11223', destination: 'Chicago', status: 'Processing', date: '2024-07-24' }
        ])
        return
      }
      
      console.log('Shipments data from Supabase:', data); // Debug log
      
      // More flexible mapping to handle different column names
      const formattedData = data.map(shipment => ({
        id: shipment.id || shipment.shipment_id || shipment.tracking_number || 'N/A',
        destination: shipment.destination || shipment.to_address || shipment.delivery_address || 'Unknown Destination',
        status: shipment.status || 'Unknown',
        date: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : 'Unknown date'
      }))
      
      setDashboardShipmentsData(formattedData)
    } catch (error) {
      console.error('Error in fetchShipmentsData:', error)
    }
  }

  // Helper function to validate token
  const isValidToken = (token) => {
    return token !== "undefined" && 
           token !== "null" && 
           token.trim() !== "" &&
           token.length > 10 // Basic validation
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  const createNewShipment = () => {
    navigate('/new-shipment')
  }

  const creatActiveJob = () => {
    navigate('/job-orders')
  }

  const handleLogin = () => {
    // Generate a more realistic fake token
    const fakeToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    
    // Save token to sessionStorage (cleared when browser/tab is closed)
    sessionStorage.setItem("authToken", fakeToken)
    
    // Update state
    setIsAuthenticated(true)
    
    // Redirect to dashboard
    navigate("/dashboard", { replace: true })
  }

  const handleLogout = () => {
    sessionStorage.removeItem('authToken')
    setIsAuthenticated(false)
    navigate('/login', { replace: true })
  }

  // Dashboard Job Summary Component
  const DashboardJobsSummary = ({ jobs, onViewAll }) => (
    <div className="card">
      <div className="card-header">
        <h2>Recent Jobs</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {jobs && jobs.length > 0 ? (
          jobs.slice(0, 3).map(job => (
            <div key={job.id} className="summary-item">
              <div className="summary-info">
                <span className="summary-id">{job.id}</span>
                <span className="summary-customer">{job.customer}</span>
              </div>
              <div className="summary-status">
                <span className={`status-badge ${job.status.toLowerCase().replace(' ', '-')}`}>
                  {job.status}
                </span>
                <span className="summary-date">{job.date}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="no-data-message">No jobs found</div>
        )}
      </div>
    </div>
  )

  // Dashboard Shipments Summary Component
  const DashboardShipmentsSummary = ({ shipments, onViewAll }) => (
    <div className="card">
      <div className="card-header">
        <h2>Recent Shipments</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {shipments && shipments.length > 0 ? (
          shipments.slice(0, 3).map(shipment => (
            <div key={shipment.id} className="summary-item">
              <div className="summary-info">
                <span className="summary-id">{shipment.id}</span>
                <span className="summary-destination">{shipment.destination}</span>
              </div>
              <div className="summary-status">
                <span className={`status-badge ${shipment.status.toLowerCase().replace(' ', '-')}`}>
                  {shipment.status}
                </span>
                <span className="summary-date">{shipment.date}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="no-data-message">No shipments found</div>
        )}
      </div>
    </div>
  )

  // Dashboard component
  const Dashboard = () => (
    <>
      <Header 
        toggleMobileMenu={toggleMobileMenu} 
        createNewShipment={createNewShipment}
        creatActiveJob={creatActiveJob}
        onLogout={handleLogout}
      />
      
      <div className="stats-grid">
        {statsData.map(stat => (
          <StatCard 
            key={stat.id}
            label={stat.label}
            value={stat.value}
            iconType={stat.icon}
            id={stat.id}
            onClick={() => navigate(stat.path)}
          />
        ))}
      </div>

      <div className="dashboard-summary-grid">
        <DashboardJobsSummary 
          jobs={dashboardJobsData} 
          onViewAll={() => navigate('/job-orders')}
        />

        <DashboardShipmentsSummary 
          shipments={dashboardShipmentsData} 
          onViewAll={() => navigate('/new-shipment')}
        />
      </div>
    </>
  )

  // Placeholder components for other routes
  const ShipmentsPage = () => (
    <div className="page-container">
      <h1>Shipments Management</h1>
      <p>Track and manage all your shipments here.</p>
    </div>
  )

  const ReportsPage = () => (
    <div className="page-container">
      <h1>Reports & Analytics</h1>
      <p>View detailed reports and analytics about your freight operations.</p>
    </div>
  )

  const SettingsPage = () => (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Configure your application settings and preferences.</p>
    </div>
  )

  const InvoicesPage = () => (
    <div className="page-container">
      <h1>Invoices</h1>
      <p>View and manage all your invoices here.</p>
    </div>
  )

  const MessagesPage = () => (
    <div className="page-container">
      <h1>Messages</h1>
      <p>View and manage all your messages here.</p>
    </div>
  )
  
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />
    }
    return children
  }

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="loading-container">
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div className="dashboard-container">
      {isAuthenticated && <Sidebar mobileMenuOpen={mobileMenuOpen} toggleMobileMenu={toggleMobileMenu} />}
      <main className="main-content">
        <Routes>
          <Route 
            path="/login" 
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Login onLogin={handleLogin} />
              )
            } 
          />
         

          <Route 
            path="/" 
            element={
              <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />
            } 
          />

          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
            <Route 
            path="/email-archive" 
            element={
              <ProtectedRoute>
                <EmailArchive />
              </ProtectedRoute>
            } 
          />
        
          <Route 
            path="/customers" 
            element={
              <ProtectedRoute>
                <CustomerPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/new-shipment" 
            element={
              <ProtectedRoute>
                <NewShipments />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/reports" 
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/settings" 
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/dsr" 
            element={
              <ProtectedRoute>
                <DSRPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/job-orders" 
            element={
              <ProtectedRoute>
                <ActiveJob />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/invoices" 
            element={
              <ProtectedRoute>
                <InvoicesPage />
              </ProtectedRoute>
            } 
          />

          <Route 
            path="/messages" 
            element={
              <ProtectedRoute>
                <MessagesPage />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </main>
    </div>
  )
}

export default App
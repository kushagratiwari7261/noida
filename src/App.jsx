// Diagnostic logs for page reloads
console.log('App.jsx loaded at:', new Date().toISOString());

window.addEventListener('beforeunload', (event) => {
  console.log('Page beforeunload event triggered at:', new Date().toISOString());
});

window.addEventListener('unload', (event) => {
  console.log('Page unload event triggered at:', new Date().toISOString());
});

window.addEventListener('visibilitychange', (event) => {
  console.log('Visibility change:', document.visibilityState, 'at:', new Date().toISOString());
});

window.addEventListener('focus', (event) => {
  console.log('Window focus event at:', new Date().toISOString());
});

window.addEventListener('blur', (event) => {
  console.log('Window blur event at:', new Date().toISOString());
});

// Log React component lifecycle
console.log('App component rendering at:', new Date().toISOString());
// src/App.jsx
import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import StatCard from './components/StatCard'
import ActiveJob from './components/ActiveJob'
import CustomerPage from './components/CustomerPage'
import Login from './components/Login'
import './App.css'
import NewShipments from './components/NewShipments'
import DSRPage from './components/DSRPage'
import EmailArchive from './components/App1.jsx'
import { supabase } from './lib/supabaseClient'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword from './components/ResetPassword'

function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [statsData, setStatsData] = useState([])
  const [dashboardJobsData, setDashboardJobsData] = useState([])
  const [dashboardShipmentsData, setDashboardShipmentsData] = useState([])
  const [isStatsLoading, setIsStatsLoading] = useState(false)
  const [isJobsLoading, setIsJobsLoading] = useState(false)
  const [isShipmentsLoading, setIsShipmentsLoading] = useState(false)
  
  const navigate = useNavigate()

  // Enhanced local cleanup function
  const performLocalCleanup = useCallback(async () => {
    try {
      // Clear all Supabase-related storage
      const storageKeys = Object.keys(localStorage);
      storageKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          localStorage.removeItem(key);
        }
      });
      
      // Also clear sessionStorage
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (key.includes('supabase') || key.includes('sb-')) {
          sessionStorage.removeItem(key);
        }
      });
      
      console.log('Local storage cleanup completed');
    } catch (cleanupError) {
      console.warn('Local cleanup error:', cleanupError);
    }
  }, []);

  // Enhanced authentication state management
  useEffect(() => {
    let mounted = true;

    const getInitialSession = async () => {
      try {
        setIsLoading(true);
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (!mounted) return;
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          await performLocalCleanup();
          setIsAuthenticated(false);
          // Don't redirect from reset-password page
          if (!window.location.pathname.includes('/login') && 
              !window.location.pathname.includes('/forgot-password') &&
              !window.location.pathname.includes('/reset-password')) {
            navigate('/login', { replace: true });
          }
          return;
        }
        
        if (session?.user) {
          // Validate session is not expired
          const isExpired = session.expires_at ? new Date(session.expires_at * 1000) < new Date() : true;
          
          if (isExpired) {
            console.log('Session expired, clearing...');
            await performLocalCleanup();
            setIsAuthenticated(false);
            // Don't redirect from reset-password page
            if (!window.location.pathname.includes('/reset-password')) {
              navigate('/login', { replace: true });
            }
          } else {
            setIsAuthenticated(true);
            setUser(session.user);
            // Redirect from auth pages to dashboard, but NOT from reset-password
            if (window.location.pathname === '/login' || 
                window.location.pathname === '/forgot-password') {
              navigate('/dashboard', { replace: true });
            }
            // reset-password page handles its own redirect logic
          }
        } else {
          setIsAuthenticated(false);
          setUser(null);
          // Only redirect to login if not on auth pages
          if (!window.location.pathname.includes('/login') && 
              !window.location.pathname.includes('/forgot-password') &&
              !window.location.pathname.includes('/reset-password')) {
            navigate('/login', { replace: true });
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        if (mounted) {
          await performLocalCleanup();
          setIsAuthenticated(false);
          // Don't redirect from reset-password page
          if (!window.location.pathname.includes('/reset-password')) {
            navigate('/login', { replace: true });
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    getInitialSession();

    // Enhanced auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, session);
        
        if (!mounted) return;
        
        try {
          switch (event) {
            case 'SIGNED_IN':
              if (session?.user) {
                setIsAuthenticated(true);
                setUser(session.user);
                // Don't redirect from reset-password page during password reset flow
                if (window.location.pathname === '/login' || 
                    window.location.pathname === '/forgot-password') {
                  navigate('/dashboard', { replace: true });
                }
                // Allow reset-password page to handle its own redirect
              }
              break;
              
            case 'SIGNED_OUT':
              await performLocalCleanup();
              setIsAuthenticated(false);
              setUser(null);
              // Don't redirect from reset-password page
              if (!window.location.pathname.includes('/login') && 
                  !window.location.pathname.includes('/forgot-password') &&
                  !window.location.pathname.includes('/reset-password')) {
                navigate('/login', { replace: true });
              }
              break;
              
            case 'TOKEN_REFRESHED':
              if (session?.user) {
                setIsAuthenticated(true);
                setUser(session.user);
              }
              break;
              
            case 'USER_UPDATED':
              if (session?.user) {
                setUser(session.user);
              }
              break;
              
            case 'PASSWORD_RECOVERY':
              // Handle password recovery specifically
              console.log('Password recovery flow initiated');
              break;
              
            default:
              console.log('Unhandled auth event:', event);
          }
        } catch (error) {
          console.error('Auth state change error:', error);
          // Fallback to safe state
          if (mounted) {
            await performLocalCleanup();
            setIsAuthenticated(false);
            setUser(null);
            // Don't redirect from reset-password page on error
            if (!window.location.pathname.includes('/reset-password')) {
              navigate('/login', { replace: true });
            }
          }
        } finally {
          if (mounted) {
            setIsLoading(false);
          }
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, performLocalCleanup]);

  // Fetch data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
    }
  }, [isAuthenticated]);

  // Fetch all dashboard data
  const fetchDashboardData = async () => {
    try {
      setError(null);
      await Promise.all([
        fetchStatsData(),
        fetchJobsData(),
        fetchShipmentsData()
      ]);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data. Please try refreshing the page.');
    }
  };

  // Forgot Password function
  const handleForgotPassword = async (email) => {
    try {
      console.log('Sending password reset email to:', email);
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        console.error('Password reset error:', error);
        return { success: false, error: error.message };
      }

      console.log('Password reset email sent successfully');
      return { success: true };
    } catch (error) {
      console.error('Unexpected error in password reset:', error);
      return { success: false, error: 'Failed to send reset email. Please try again.' };
    }
  };

  // Reset Password function - ENHANCED
  const handleResetPassword = async (password) => {
    try {
      console.log('Updating user password...');
      
      // First, check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('No valid session for password reset:', sessionError);
        return { 
          success: false, 
          error: 'Your reset session has expired. Please request a new reset link.' 
        };
      }
      
      const { data, error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        console.error('Password update error:', error);
        return { success: false, error: error.message };
      }

      console.log('Password updated successfully:', data);
      
      // After successful password update, sign out the user to clear the recovery session
      await supabase.auth.signOut();
      
      return { success: true };
    } catch (error) {
      console.error('Unexpected error in password update:', error);
      return { success: false, error: 'Failed to update password. Please try again.' };
    }
  };

  // Supabase Login function
  const handleLogin = async (email, password) => {
    try {
      setIsLoggingIn(true);
      setError(null);
      
      console.log('Attempting login with:', email);
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        console.error('Supabase login error:', error);
        return { 
          success: false, 
          error: error.message || 'Invalid email or password. Please try again.' 
        };
      }

      if (data.session) {
        console.log('Login successful:', data.user);
        return { success: true };
      } else {
        return { 
          success: false, 
          error: 'Login failed. Please try again.' 
        };
      }
      
    } catch (error) {
      console.error('Unexpected login error:', error);
      return { 
        success: false, 
        error: 'An unexpected error occurred. Please try again.' 
      };
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Enhanced Logout function
  const handleLogout = useCallback(async () => {
    try {
      console.log('Starting logout process...');
      
      // First, check if we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.log('Session check error:', sessionError);
        // Continue with cleanup anyway
      }
      
      if (!session) {
        console.log('No active session found, performing local cleanup');
      } else {
        console.log('Active session found, attempting Supabase logout');
        // Attempt Supabase logout
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.warn('Supabase logout failed:', error);
          // Continue with cleanup anyway
        } else {
          console.log('Supabase logout successful');
        }
      }
      
      // Always perform local cleanup
      await performLocalCleanup();
      
      // Update state and redirect
      setIsAuthenticated(false);
      setUser(null);
      
      // Navigate to login page
      navigate('/login', { replace: true });
      
      console.log('Logout process completed');
      
    } catch (error) {
      console.error('Unexpected error during logout:', error);
      // Fallback: ensure user is logged out locally
      await performLocalCleanup();
      setIsAuthenticated(false);
      setUser(null);
      navigate('/login', { replace: true });
    }
  }, [navigate, performLocalCleanup]);

  // Fetch stats data from Supabase
  const fetchStatsData = async () => {
    setIsStatsLoading(true);
    try {
      // Get total shipments count
      const { count: totalShipments, error: shipmentsError } = await supabase
        .from('shipments')
        .select('*', { count: 'exact', head: true });
      
      // Get jobs count
      const { count: jobsCount, error: jobsError } = await supabase
        .from('jobs')
        .select('*', { count: 'exact', head: true });
      
      // Get invoices count (assuming you have an invoices table)
      const { count: invoicesCount, error: invoicesError } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true });
      
      // Get messages count (assuming you have a messages table)
      const { count: messagesCount, error: messagesError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true });
      
      if (shipmentsError || jobsError || invoicesError || messagesError) {
        console.error('Error fetching stats:', { shipmentsError, jobsError, invoicesError, messagesError });
        // Fallback to default data
        setStatsData([
          { label: 'Total Shipments', value: '1,250', icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
          { label: 'Jobs', value: '320', icon: 'teal', id: 'Jobs', path: '/job-orders' },
          { label: 'Invoices', value: '15', icon: 'yellow', id: 'Invoices', path: '/invoices' },
          { label: 'Messages', value: '5', icon: 'red', id: 'Messages', path: '/messages' }
        ]);
        return;
      }
      
      // Format numbers with commas
      const formatNumber = (num) => num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "0";
      
      setStatsData([
        { label: 'Total Shipments', value: formatNumber(totalShipments), icon: 'blue', id: 'total-shipments', path: '/new-shipment' },
        { label: 'Jobs', value: formatNumber(jobsCount), icon: 'teal', id: 'Jobs', path: '/job-orders' },
        { label: 'Invoices', value: formatNumber(invoicesCount), icon: 'yellow', id: 'Invoices', path: '/invoices' },
        { label: 'Messages', value: formatNumber(messagesCount), icon: 'red', id: 'Messages', path: '/messages' }
      ]);
    } catch (error) {
      console.error('Error in fetchStatsData:', error);
      setError('Failed to load statistics data.');
    } finally {
      setIsStatsLoading(false);
    }
  };

  // Fetch jobs data from Supabase
  const fetchJobsData = async () => {
    setIsJobsLoading(true);
    try {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) {
        console.error('Error fetching jobs:', error);
        // Fallback to sample data
        setDashboardJobsData([
          { id: 'JOB-001', customer: 'Acme Corp', status: 'In Progress', date: '2024-07-26' },
          { id: 'JOB-002', customer: 'Global Imports', status: 'Completed', date: '2024-07-25' },
          { id: 'JOB-003', customer: 'Tech Solutions', status: 'Pending', date: '2024-07-24' }
        ]);
        return;
      }
      
      console.log('Jobs data from Supabase:', data);
      
      // More flexible mapping to handle different column names
      const fetchJobs = data.map(job => ({
        id:  job.job_no || 'N/A',
        customer: job.client || 'Unknown Customer',
        status: job.status || 'Unknown',
        date: job.job_date ? new Date(job.job_date).toLocaleDateString() : 'Unknown date' 
      }));
      
      setDashboardJobsData(fetchJobs);
    } catch (error) {
      console.error('Error in fetchJobsData:', error);
      setError('Failed to load jobs data.');
    } finally {
      setIsJobsLoading(false);
    }
  };

  // Fetch shipments data from Supabase
  const fetchShipmentsData = async () => {
    setIsShipmentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) {
        console.error('Error fetching shipments:', error);
        // Fallback to sample data
        setDashboardShipmentsData([
          { id: 'SHIP-12345', destination: 'New York', status: 'In Transit', date: '2024-07-26' },
          { id: 'SHIP-67890', destination: 'Los Angeles', status: 'Delivered', date: '2024-07-25' },
          { id: 'SHIP-11223', destination: 'Chicago', status: 'Processing', date: '2024-07-24' }
        ]);
        return;
      }
      
      console.log('Shipments data from Supabase:', data);
      
      // More flexible mapping to handle different column names
      const formattedData = data.map(shipment => ({
        id: shipment.id || shipment.shipment_id || shipment.tracking_number || 'N/A',
        destination: shipment.destination || shipment.to_address || shipment.delivery_address || 'Unknown Destination',
        status: shipment.status || 'Unknown',
        date: shipment.created_at ? new Date(shipment.created_at).toLocaleDateString() : 'Unknown date'
      }));
      
      setDashboardShipmentsData(formattedData);
    } catch (error) {
      console.error('Error in fetchShipmentsData:', error);
      setError('Failed to load shipments data.');
    } finally {
      setIsShipmentsLoading(false);
    }
  };

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen(prev => !prev);
  }, []);

  const createNewShipment = useCallback(() => {
    navigate('/new-shipment');
  }, [navigate]);

  const creatActiveJob = useCallback(() => {
    navigate('/job-orders');
  }, [navigate]);

  // Dashboard Job Summary Component
  const DashboardJobsSummary = ({ jobs, onViewAll, isLoading }) => (
    <div className="card">
      <div className="card-header">
        <h2>Recent Jobs</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {isLoading ? (
          <div className="loading-message">Loading jobs...</div>
        ) : jobs && jobs.length > 0 ? (
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
  );

  // Dashboard Shipments Summary Component
  const DashboardShipmentsSummary = ({ shipments, onViewAll, isLoading }) => (
    <div className="card">
      <div className="card-header">
        <h2>Recent Shipments</h2>
        <button className="view-all-btn" onClick={onViewAll}>View All</button>
      </div>
      <div className="summary-content">
        {isLoading ? (
          <div className="loading-message">Loading shipments...</div>
        ) : shipments && shipments.length > 0 ? (
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
  );

  // Dashboard component
  const Dashboard = () => (
    <>
      <Header 
        toggleMobileMenu={toggleMobileMenu} 
        createNewShipment={createNewShipment}
        creatActiveJob={creatActiveJob}
        onLogout={handleLogout}
        user={user}
      />
      
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      <div className="stats-grid">
        {isStatsLoading ? (
          <div className="loading-stats">Loading statistics...</div>
        ) : (
          statsData.map(stat => (
            <StatCard 
              key={stat.id}
              label={stat.label}
              value={stat.value}
              iconType={stat.icon}
              id={stat.id}
              onClick={() => navigate(stat.path)}
            />
          ))
        )}
      </div>

      <div className="dashboard-summary-grid">
        <DashboardJobsSummary 
          jobs={dashboardJobsData} 
          onViewAll={() => navigate('/job-orders')}
          isLoading={isJobsLoading}
        />

        <DashboardShipmentsSummary 
          shipments={dashboardShipmentsData} 
          onViewAll={() => navigate('/new-shipment')}
          isLoading={isShipmentsLoading}
        />
      </div>
    </>
  );

  // Protected Route Component - UPDATED
  const ProtectedRoute = ({ children }) => {
    if (isLoading) {
      return (
        <div className="loading-container">
          <div>Loading...</div>
        </div>
      );
    }
    
    // Allow access to auth pages without authentication
    const authPages = ['/login', '/forgot-password', '/reset-password'];
    const currentPath = window.location.pathname;
    
    // Special case: reset-password should always be accessible
    if (currentPath === '/reset-password') {
      return children;
    }
    
    if (!isAuthenticated && !authPages.includes(currentPath)) {
      return <Navigate to="/login" replace />;
    }
  
    return children;
  };

  // Placeholder components for other routes
  const ShipmentsPage = () => (
    <div className="page-container">
      <h1>Shipments Management</h1>
      <p>Track and manage all your shipments here.</p>
    </div>
  );

  const ReportsPage = () => (
    <div className="page-container">
      <h1>Reports & Analytics</h1>
      <p>View detailed reports and analytics about your freight operations.</p>
    </div>
  );

  const SettingsPage = () => (
    <div className="page-container">
      <h1>Settings</h1>
      <p>Configure your application settings and preferences.</p>
    </div>
  );

  const InvoicesPage = () => (
    <div className="page-container">
      <h1>Invoices</h1>
      <p>View and manage all your invoices here.</p>
    </div>
  );

  const MessagesPage = () => (
    <div className="page-container">
      <h1>Messages</h1>
      <p>View and manage all your messages here.</p>
    </div>
  );
  
  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <div>Loading Application...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      {isAuthenticated && (
        <Sidebar 
          mobileMenuOpen={mobileMenuOpen} 
          toggleMobileMenu={toggleMobileMenu} 
          onLogout={handleLogout}
        />
      )}
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

          {/* Forgot Password Route */}
          <Route
            path="/forgot-password"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <ForgotPassword onResetPassword={handleForgotPassword} />
              )
            }
          />

          {/* Reset Password Route - FIXED: Always accessible */}
          <Route
            path="/reset-password"
            element={<ResetPassword onUpdatePassword={handleResetPassword} />}
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

          {/* 404 Fallback Route */}
          <Route 
            path="*" 
            element={
              <div className="page-container">
                <h1>404 - Page Not Found</h1>
                <p>The page you're looking for doesn't exist.</p>
                <button onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
              </div>
            } 
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
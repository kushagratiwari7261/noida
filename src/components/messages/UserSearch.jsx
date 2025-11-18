import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import './UserSearch.css';

const UserSearch = ({ onUserSelect, selectedUser, currentUserId }) => {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const searchUsers = async () => {
      if (!query.trim()) {
        setUsers([]);
        return;
      }

      setLoading(true);
      
      try {
        console.log('🔍 Searching for:', query);
        
        // Clean the query for special characters
        const cleanQuery = query.trim();
        
        // Use multiple filters instead of .or() with complex queries
        const { data, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar_url, email')
          .or(`username.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`)
          .neq('id', currentUserId)
          .limit(10);

        // If no results from name search, try email search separately
        if ((!data || data.length === 0) && cleanQuery.includes('@')) {
          console.log('🔍 Trying email search...');
          const { data: emailData, error: emailError } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url, email')
            .ilike('email', `%${cleanQuery}%`)
            .neq('id', currentUserId)
            .limit(10);
          
          if (!emailError && emailData) {
            setUsers(emailData);
          } else if (emailError) {
            console.error('Email search error:', emailError);
          }
        } else if (!error && data) {
          setUsers(data);
        }
        
        if (error) {
          console.error('❌ Search error:', error);
        }
        
      } catch (error) {
        console.error('Error searching users:', error);
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300);
    return () => clearTimeout(timeoutId);
  }, [query, currentUserId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user) => {
    console.log('✅ User selected:', user);
    onUserSelect(user);
    setQuery(user.full_name || user.username || user.email);
    setShowDropdown(false);
    setUsers([]);
  };

  const handleInputChange = (e) => {
    setQuery(e.target.value);
    if (e.target.value && !selectedUser) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  };

  const clearSelection = () => {
    setQuery('');
    onUserSelect(null);
    setShowDropdown(true);
    setUsers([]);
  };

  const handleInputFocus = () => {
    if (query.trim() && !selectedUser) {
      setShowDropdown(true);
    }
  };

  // Format user display name
  const getUserDisplayName = (user) => {
    if (user.full_name) return user.full_name;
    if (user.username) return user.username;
    return user.email;
  };

  return (
    <div className="user-search" ref={dropdownRef}>
      <div className="user-search-input-wrapper">
        <input
          type="text"
          value={selectedUser ? getUserDisplayName(selectedUser) : query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="Search by name, username, or email..."
          className="user-search-input"
          disabled={!!selectedUser}
        />
        {selectedUser && (
          <button 
            onClick={clearSelection}
            className="clear-selection"
            aria-label="Clear selection"
            type="button"
          >
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="user-search-dropdown">
          {loading ? (
            <div className="dropdown-loading">
              <div className="loading-spinner"></div>
              Searching...
            </div>
          ) : users.length > 0 ? (
            <div className="dropdown-results">
              {users.map(user => (
                <div
                  key={user.id}
                  className="user-option"
                  onClick={() => handleSelectUser(user)}
                >
                  <div className="user-avatar">
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={getUserDisplayName(user)} />
                    ) : (
                      <div className="avatar-fallback">
                        {(getUserDisplayName(user) || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="user-info">
                    <div className="user-primary">
                      <span className="user-name">{getUserDisplayName(user)}</span>
                    </div>
                    <div className="user-secondary">
                      {user.email && (
                        <span className="user-email">{user.email}</span>
                      )}
                      {user.username && user.username !== getUserDisplayName(user) && (
                        <span className="user-username">@{user.username}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : query.trim() && !loading ? (
            <div className="dropdown-empty">
              No users found for "{query}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default UserSearch;
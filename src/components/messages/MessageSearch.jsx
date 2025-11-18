import { useState, useRef } from 'react';
import './MessageSearch.css';

const MessageSearch = ({ onSearch, searchQuery }) => {
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const searchTimeoutRef = useRef(null);

  const handleInputChange = (e) => {
    const value = e.target.value;
    setLocalQuery(value);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      onSearch(value);
    }, 300);
  };

  const handleClear = () => {
    setLocalQuery('');
    onSearch('');
  };

  return (
    <div className="message-search">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={localQuery}
          onChange={handleInputChange}
          placeholder="Search messages..."
          className="search-input"
        />
        {localQuery && (
          <button 
            onClick={handleClear}
            className="clear-search"
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export default MessageSearch;
// src/components/ActivityTable.jsx
import './ActivityTable.css';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';

const ActivityTable = ({ activities }) => {
  const navigate = useNavigate();
  const tableContainerRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState('auto');

  const getStatusClass = (status) => {
    switch (status) {
      case 'Completed': return 'status-completed';
      case 'In Progress': return 'status-progress';
      case 'Generated': return 'status-generated';
      default: return '';
    }
  }

  const handleAddShipment = () => {
    navigate('/new-shipment');
  }

  // Sample data
  const sampleActivities = [
    {
      shipmentNo: "MAASE190487",
      client: "FRESA DEMO DUBAI LLC",
      jobNo: "CMAASE190318",
      por: "INMAA",
      pof: "AEDXB"
    },
    {
      shipmentNo: "MAASE190219",
      client: "AMAZON PVT LMD",
      jobNo: "CMAASE190157",
      por: "INMAA",
      pof: "AEDXB"
    },
    {
      shipmentNo: "MAASE190217",
      client: "AMAZON PVT LMD",
      jobNo: "CMAASE190156",
      por: "INMAA",
      pof: "AEDXB"
    },
    {
      shipmentNo: "MAASE190216",
      client: "AMAZON PVT LMD",
      jobNo: "CMAASE190154",
      por: "INMAA",
      pof: "AEDXB"
    }
  ];

  // Always show sample + real activities
  const displayActivities = [...sampleActivities, ...(activities || [])];
  console.log("Activities to display:", displayActivities);

  // Adjust max height based on content
  useEffect(() => {
    if (tableContainerRef.current) {
      const tableHeight = tableContainerRef.current.scrollHeight;
      const calculatedMaxHeight = Math.min(tableHeight, 400); // 400px max height
      setMaxHeight(`${calculatedMaxHeight}px`);
    }
  }, [displayActivities]);

  return (
    <div className="card expandable-card">
      <div className="table-header">
        <h2>Current Active Shipments</h2>
        <button className="add-shipment-btn" onClick={handleAddShipment}>
          <span className="plus-icon">+</span>
          Add Shipment
        </button>
      </div>
      <div
        className="table-container"
        ref={tableContainerRef}
        style={{ maxHeight: maxHeight, overflowY: 'auto' }}
      >
        <table className="activity-table">
          <thead>
            <tr>
              <th>Shipment No.</th>
              <th>Client</th>
              <th>Job No.</th>
              <th>POR</th>
              <th>POF</th>
            </tr>
          </thead>
          <tbody>
            {displayActivities.map((activity, index) => (
              <tr key={index}>
                <td>{activity.shipmentNo}</td>
                <td>{activity.client}</td>
                <td>{activity.jobNo}</td>
                <td>{activity.por}</td>
                <td>{activity.pof}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ActivityTable;

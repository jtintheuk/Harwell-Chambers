import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken // Added for preview auth
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  addDoc, 
  collection, 
  query, 
  where, 
  getDocs
} from 'firebase/firestore';

// --- Helper Functions ---

/**
 * Formats milliseconds into a human-readable string (H, M, S)
 * @param {number} ms - Duration in milliseconds
 */
function formatDuration(ms) {
  if (ms < 0) ms = 0;
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)));

  let str = "";
  if (hours > 0) str += `${hours}h `;
  if (minutes > 0 || hours > 0) str += `${minutes}m `;
  str += `${seconds}s`;
  
  return str.trim();
}

/**
 * Formats an ISO date string into a readable local time
 * @param {string} isoString - ISO date string
 */
function formatDateTime(isoString) {
  if (!isoString) return "NA";
  return new Date(isoString).toLocaleString();
}

/**
 * Formats a report object into a plain text string for email
 * @param {object} reportData - The report object
 */
function formatReportForEmail(reportData) {
  let body = `JOB COMPLETION REPORT\n`;
  body += `====================================\n\n`;
  
  body += `JOB DETAILS\n`;
  body += `------------------------------------\n`;
  body += `Machine:      ${reportData.machineName}\n`;
  body += `Job Name:     ${reportData.job.jobName || 'N/A'}\n`;
  body += `WR Number:    ${reportData.job.wrNumber || 'N/A'}\n`;
  body += `Crates:       ${reportData.job.crateCount || 0}\n\n`;
  
  body += `TIMELINE\n`;
  body += `------------------------------------\n`;
  body += `Job Started:   ${formatDateTime(reportData.startTime)}\n`;
  body += `Job Completed: ${formatDateTime(reportData.finishTime)}\n\n`;
  
  body += `SUMMARY\n`;
  body += `------------------------------------\n`;
  body += `Total Production Time: ${reportData.totalProductionTime}\n`;
  body += `Total Downtime:        ${reportData.totalDowntime}\n\n`;
  
  body += `DOWNTIME LOG\n`;
  body += `------------------------------------\n`;
  
  if (reportData.downtimeLogs.length === 0) {
    body += `No downtime recorded for this job.\n`;
  } else {
    reportData.downtimeLogs.forEach((log, index) => {
      body += `Event ${index + 1}:\n`;
      body += `  From:     ${formatDateTime(log.downAt)}\n`;
      body += `  To:       ${formatDateTime(log.upAt)}\n`;
      body += `  Duration: ${formatDuration(new Date(log.upAt) - new Date(log.downAt))}\n`;
      body += `  Reason:   ${log.description || "N/A"}\n\n`;
    });
  }
  
  return body;
}

// --- Firebase Config ---
// Use preview config if available, otherwise fall back to production config
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyA7bQNTmraeaAnB8S9MWobDEVjPgRihFI",
      authDomain: "harwell-chamber-monitoring.firebaseapp.com",
      projectId: "harwell-chamber-monitoring",
      storageBucket: "harwell-chamber-monitoring.appspot.com",
      messagingSenderId: "620112704693",
      appId: "1:620112704693:web:f6795328bef8177f33f0fc"
    };
// ========================================================================

// Check if we are in the preview environment
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// Sanitize the appId to remove any potential slashes from filename injection
const appId = rawAppId.split('/')[0];


// --- Initial Data ---

const INITIAL_MACHINES = [
  {
    id: 1,
    name: "Valley 1",
    currentJobs: [], // Array of { jobId, wrNumber, jobName, crateCount }
    status: "Idle", // "Idle", "Running", "Down"
    startTime: null,
    finishTime: null,
    downtimeLog: [], // Array of { downAt: "ISO string", upAt: "ISO string", description: "string" }
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 2,
    name: "McKenzie 5",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 3,
    name: "Valley 2",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 4,
    name: "Jerone 1",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 5,
    name: "Jerone 2",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 6,
    name: "JBB",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 7,
    name: "Robson",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
  {
    id: 8,
    name: "Autec",
    currentJobs: [],
    status: "Idle",
    startTime: null,
    finishTime: null,
    downtimeLog: [],
    currentDowntimeStart: null,
    currentDowntimeDescription: null,
  },
];

// --- React Components ---

/**
 * Component for the Confirmation Modal
 */
function ConfirmationModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full text-gray-900">
        <h3 className="text-2xl font-bold text-center mb-6">Are you sure?</h3>
        <p className="text-center mb-8">
          Do you want to mark this job as complete? This action cannot be undone.
        </p>
        <div className="flex justify-around">
          <button
            onClick={() => onConfirm(true)}
            className="px-8 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all"
          >
            Yes, Complete
          </button>
          <button
            onClick={() => onConfirm(false)}
            className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-400 transition-all"
          >
            No, Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Component for adding a new job to the queue
 */
function AddJobModal({ onSubmit, onClose }) {
  const [wrNumber, setWrNumber] = useState("");
  const [jobName, setJobName] = useState("");
  const [crateCount, setCrateCount] = useState(0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (crateCount < 0) {
      return; 
    }
    onSubmit({
      jobId: Date.now(), // Simple unique ID for the job
      wrNumber: wrNumber || "N/A",
      jobName: jobName || "N/A",
      crateCount: crateCount,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full text-gray-900">
        <h3 className="text-2xl font-bold text-center mb-6">Add Job</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WR Number
            </label>
            <input
              type="text"
              value={wrNumber}
              onChange={(e) => setWrNumber(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., WR-7890"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Job Name
            </label>
            <input
              type="text"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Main Assembly"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Crates
            </label>
            <input
              type="number"
              min="0"
              value={crateCount}
              onChange={(e) => setCrateCount(parseInt(e.target.value, 10) || 0)}
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="flex justify-around mt-8">
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
          >
            Add Job
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-400 transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


/**
 * Component for adding a downtime description
 */
function DowntimeModal({ onSubmit, onClose }) {
  const [reason, setReason] = useState("Break down"); // Default reason
  const [notes, setNotes] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const fullDescription = `${reason}: ${notes || "No additional notes."}`;
    onSubmit(fullDescription);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full text-gray-900">
        <h3 className="text-2xl font-bold text-center mb-6">Report Downtime</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Downtime Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Break down">Break down</option>
              <option value="Scheduled Maintenance">Scheduled Maintenance</option>
              <option value="Checking work">Checking work</option>
              <option value="Other">Other (see notes)</option>
            </select>
          </div>
        
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Additional Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-24 p-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add any extra details here..."
            />
          </div>
        </div>

        <div className="flex justify-around mt-8">
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-400 transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}


/**
 * Component for the Final Report Modal
 */
function ReportModal({ reportData, onClose }) {
  if (!reportData) return null;

  const emailSubject = `Job Report: ${reportData.job.jobName} (WR: ${reportData.job.wrNumber})`;
  const emailBody = formatReportForEmail(reportData);
  const mailtoLink = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full text-gray-900 max-h-[90vh] overflow-y-auto">
        <h3 className="text-3xl font-bold text-center mb-6">Job Completion Report</h3>
        
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
          <div>
            <p className="text-sm text-gray-500">Machine</p>
            <p className="text-lg font-semibold">{reportData.machineName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Job Name</p>
            <p className="text-lg font-semibold">{reportData.job.jobName || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">WR Number</p>
            <p className="text-lg font-semibold">{reportData.job.wrNumber || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Number of Crates</p>
            <p className="text-lg font-semibold">{reportData.job.crateCount || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Job Started</p>
            <p className="text-lg font-semibold">{formatDateTime(reportData.startTime)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Job Completed</p>
            <p className="text-lg font-semibold">{formatDateTime(reportData.finishTime)}</p>
          </div>
        </div>

        <hr className="my-6" />

        <h4 className="text-xl font-bold mb-4">Summary</h4>
        <div className="flex justify-around bg-gray-100 p-4 rounded-lg mb-6">
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Production Time</p>
            <p className="text-2xl font-bold text-green-600">{reportData.totalProductionTime}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500">Total Downtime</p>
            <p className="text-2xl font-bold text-yellow-600">{reportData.totalDowntime}</p>
          </div>
        </div>

        <h4 className="text-xl font-bold mb-4">Downtime Log</h4>
        <div className="space-y-3">
          {reportData.downtimeLogs.length === 0 ? (
            <p className="text-gray-500 italic text-center">No downtime recorded for this job.</p>
          ) : (
            reportData.downtimeLogs.map((log, index) => (
              <div key={index} className="bg-gray-50 p-4 rounded-lg flex justify-between items-start">
                <div className="flex-grow">
                  <p className="font-semibold">Event {index + 1}</p>
                  <p className="text-sm text-gray-600">From: {formatDateTime(log.downAt)}</p>
                  <p className="text-sm text-gray-600">To: &nbsp; &nbsp; {formatDateTime(log.upAt)}</p>
                  <p className="text-sm text-gray-800 mt-2">
                    <span className="font-semibold">Reason:</span> {log.description || "N/A"}
                  </p>
                </div>
                <p className="font-bold text-yellow-700 ml-4 flex-shrink-0">
                  {formatDuration(new Date(log.upAt) - new Date(log.downAt))}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <button
            onClick={onClose}
            className="px-10 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
          >
            Close Report
          </button>
          <a
            href={mailtoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="px-10 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-all"
          >
            Email Report
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Component for searching the database
 */
function SearchModal({ onClose, onSearch, onViewReport, results, isSearching, error }) {
  const [searchType, setSearchType] = useState("job.wrNumber");
  const [searchValue, setSearchValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch(searchType, searchValue.trim());
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full text-gray-900 max-h-[90vh] flex flex-col">
        <h3 className="text-3xl font-bold text-center mb-6">Search Completed Jobs</h3>
        
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 mb-6">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="p-3 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="job.wrNumber">WR Number</option>
            <option value="job.jobName">Job Name</option>
            <option value="machineName">Machine Name</option>
          </select>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="flex-grow p-3 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter search term..."
          />
          <button
            type="submit"
            className="p-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-all"
            disabled={isSearching}
          >
            {isSearching ? "Searching..." : "Search"}
          </button>
        </form>

        <div className="flex-grow overflow-y-auto space-y-3">
          {error && <p className="text-red-500 text-center">{error}</p>}
          {!error && isSearching && <p className="text-gray-500 text-center">Loading search results...</p>}
          {!error && !isSearching && results.length === 0 && (
            <p className="text-gray-500 text-center italic">
              {searchValue.trim()
                ? "No results found for your search."
                : "There are no completed jobs in the database yet."}
            </p>
          )}
          {!error && !isSearching && results.length > 0 && (
            results.map((report) => (
              <div 
                key={report.id} 
                className="bg-gray-100 p-4 rounded-lg cursor-pointer hover:bg-gray-200 transition-all"
                onClick={() => onViewReport(report)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-lg">{report.job.jobName}</span>
                  <span className="text-sm font-semibold">{report.machineName}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-gray-600 mt-1">
                  <span>WR: {report.job.wrNumber}</span>
                  <span className="text-xs">Completed: {formatDateTime(report.finishTime)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={onClose}
            className="px-10 py-3 bg-gray-300 text-gray-800 font-semibold rounded-lg shadow-md hover:bg-gray-400 transition-all"
          >
            Close Search
          </button>
        </div>
      </div>
    </div>
  );
}


/**
 * Component for displaying a running timer
 */
function RunningTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startTime) {
      const timer = setInterval(() => {
        setElapsed(new Date() - new Date(startTime));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [startTime]);

  if (!startTime) return null;

  return (
    <p className="text-2xl font-mono text-center text-blue-300">
      {formatDuration(elapsed)}
    </p>
  );
}

/**
 * Component for a single Machine Card
 */
function MachineCard({ machine, onUpdate, onCompleteJobRequest, onDowntimeRequest, onAddJobRequest, onStartMachine }) {
  
  const handleAddJob = () => {
    onAddJobRequest(machine.id);
  };
  
  const handleDowntimeToggle = () => {
    if (machine.status === "Running") {
      onDowntimeRequest(machine.id);
    } else if (machine.status === "Down") {
      const newLogEntry = {
        downAt: machine.currentDowntimeStart,
        upAt: new Date().toISOString(),
        description: machine.currentDowntimeDescription,
      };
      onUpdate({
        ...machine,
        status: "Running",
        downtimeLog: [...machine.downtimeLog, newLogEntry],
        currentDowntimeStart: null,
        currentDowntimeDescription: null,
      });
    }
  };
  
  const handleCompleteJob = (jobId) => {
    onCompleteJobRequest(machine.id, jobId);
  };

  const statusColors = {
    Idle: "bg-gray-500",
    Running: "bg-green-500 animate-pulse",
    Down: "bg-yellow-500 animate-pulse",
  };

  return (
    <div className="bg-gray-800 rounded-2xl shadow-lg p-6 flex flex-col justify-between transition-all hover:shadow-2xl">
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-2xl font-bold text-white">{machine.name}</h3>
          <span
            className={`px-4 py-1 rounded-full text-sm font-semibold text-white ${
              statusColors[machine.status]
            }`}
          >
            {machine.status}
          </span>
        </div>

        <h4 className="text-gray-400 mb-2 mt-4">Current Jobs</h4>
        <div className="mb-6 min-h-[120px]">
          {machine.currentJobs.length === 0 ? (
            <p className="text-lg text-gray-500 font-medium mb-6 italic text-center p-4">
              No jobs active.
            </p>
          ) : (
            <ul className="space-y-3 text-gray-300">
              {machine.currentJobs.map((job) => (
                <li 
                  key={job.jobId} 
                  className="bg-gray-700/50 p-3 rounded-md"
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold text-lg text-green-300">{job.jobName}</span>
                    <button
                      onClick={() => handleCompleteJob(job.jobId)}
                      className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded shadow hover:bg-red-700 transition-all"
                    >
                      End Job
                    </button>
                  </div>
                  <div className="flex justify-between text-sm text-blue-300">
                    <span>WR #: {job.wrNumber}</span>
                    <span>Crates: {job.crateCount}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {machine.status !== "Idle" && (
          <div className="mb-6">
            <p className="text-gray-400 text-sm text-center">Job Started: {formatDateTime(machine.startTime)}</p>
            <p className="text-gray-400 text-sm text-center mb-2">Total Elapsed Time:</p>
            <RunningTimer startTime={machine.startTime} />
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* Add Job Button (Always visible) */}
        <button
          onClick={handleAddJob}
          className="w-full p-4 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-all"
        >
          Add Job
        </button>

        {/* Start Machine Button */}
        {machine.status === "Idle" && machine.currentJobs.length > 0 && (
          <button
            onClick={() => onStartMachine(machine.id)}
            className="w-full p-4 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 transition-all"
          >
            Start Machine
          </button>
        )}

        {/* Downtime Button */}
        {machine.status === "Running" && (
          <button
            onClick={handleDowntimeToggle}
            className="w-full p-4 bg-yellow-500 text-gray-900 font-bold rounded-lg shadow-md hover:bg-yellow-600 transition-all"
          >
            Report Downtime
          </button>
        )}
        {machine.status === "Down" && (
          <button
            onClick={handleDowntimeToggle}
            className="w-full p-4 bg-blue-500 text-white font-bold rounded-lg shadow-md hover:bg-blue-600 transition-all"
          >
            Resume Production
          </button>
        )}

      </div>
    </div>
  );
}

/**
 * Main Application Component
 */
export default function App() {
  const [machines, setMachines] = useState(INITIAL_MACHINES);
  const [confirmModalData, setConfirmModalData] = useState({ machineId: null, jobId: null });
  const [downtimeModalMachineId, setDowntimeModalMachineId] = useState(null);
  const [addJobModalMachineId, setAddJobModalMachineId] = useState(null);
  const [reportData, setReportData] = useState(null); // For immediate report
  
  // --- Firebase & Search State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const [reportToView, setReportToView] = useState(null); // For viewing old reports

  // --- Firebase Initialization Effect ---
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const dbInstance = getFirestore(app);
      
      setDb(dbInstance);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // Check for the preview environment's special token first
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
              await signInWithCustomToken(authInstance, __initial_auth_token);
              console.log("Signed in with preview token.");
            } catch (tokenError) {
              console.error("Error signing in with preview token, falling back to anonymous:", tokenError);
              // If token fails, fall back to anonymous (which will also fail if keys are wrong, but it's the right flow)
              await signInAnonymously(authInstance);
            }
          } else {
            // No preview token, just sign in anonymously (for production)
            console.log("No preview token, signing in anonymously.");
            signInAnonymously(authInstance).catch((authError) => {
              console.error("Error signing in anonymously:", authError);
            });
          }
        }
      });
      
      return () => unsubscribe(); // Cleanup listener
      
    } catch (e) {
      console.error("Error initializing Firebase:", e);
    }
  }, []); // Only run once on mount


  /**
   * Updates a single machine in the state
   */
  const handleUpdateMachine = (updatedMachine) => {
    setMachines((prevMachines) =>
      prevMachines.map((m) => (m.id === updatedMachine.id ? updatedMachine : m))
    );
  };

  /**
   * Opens the add job modal
   */
  const handleAddJobRequest = (machineId) => {
    setAddJobModalMachineId(machineId);
  };

  /**
   * Opens the downtime description modal
   */
  const handleDowntimeRequest = (machineId) => {
    setDowntimeModalMachineId(machineId);
  };

/**
   * Opens the completion confirmation modal
   */
  const handleCompleteJobRequest = (machineId, jobId) => {
    setConfirmModalData({ machineId, jobId });
  };

  /**
   * Handles submission of the new job data to the queue
   */
  const handleAddJobSubmit = (jobData) => {
    if (!addJobModalMachineId) return;
    
    const machineToUpdate = machines.find((m) => m.id === addJobModalMachineId);
    if (machineToUpdate) {
      const updatedJobs = [...machineToUpdate.currentJobs, jobData]; // Add new job
      
      // ALWAYS just add the job. Do not start the machine.
      handleUpdateMachine({
        ...machineToUpdate,
        currentJobs: updatedJobs,
      });
    }
    setAddJobModalMachineId(null); // Close modal
  };

  /**
   * Starts the machine's timer and sets status to "Running"
   */
  const handleStartMachine = (machineId) => {
    const machineToStart = machines.find((m) => m.id === machineId);
    
    // Only start if it's Idle and has jobs
    if (machineToStart && machineToStart.status === "Idle" && machineToStart.currentJobs.length > 0) {
      handleUpdateMachine({
        ...machineToStart,
        status: "Running",
        startTime: new Date().toISOString(), // Set the start time
        finishTime: null,
        downtimeLog: [], // Reset logs for the new run
        currentDowntimeStart: null,
        currentDowntimeDescription: null,
      });
    }
  };


  /**
   * Handles submission of the downtime description
   */
  const handleDowntimeSubmit = (description) => {
    if (!downtimeModalMachineId) return;

    const machineToUpdate = machines.find((m) => m.id === downtimeModalMachineId);
    if (machineToUpdate) {
      handleUpdateMachine({
        ...machineToUpdate,
        status: "Down",
        currentDowntimeStart: new Date().toISOString(),
        currentDowntimeDescription: description,
      });
    }
    setDowntimeModalMachineId(null); // Close modal
  };

  /**
   * Generates the report object
   */
  const generateReport = (machine, job) => {
    const finishTime = new Date();
    const startTime = new Date(machine.startTime);

    let finalDowntimeLogs = [...machine.downtimeLog];
    
    // If machine was 'Down' when completed, we need to close out that final downtime log
    if (machine.status === "Down") {
      finalDowntimeLogs.push({
        downAt: machine.currentDowntimeStart,
        upAt: finishTime.toISOString(),
        description: machine.currentDowntimeDescription,
      });
    }

    const totalDowntimeMs = finalDowntimeLogs.reduce((total, log) => {
      return total + (new Date(log.upAt) - new Date(log.downAt));
    }, 0);
    
    const totalDurationMs = finishTime - startTime;
    const totalProductionMs = totalDurationMs - totalDowntimeMs;

    return {
      machineName: machine.name,
      job: job, // Report on the specific job that was completed
      startTime: machine.startTime,
      finishTime: finishTime.toISOString(),
      downtimeLogs: finalDowntimeLogs,
      totalProductionTime: formatDuration(totalProductionMs),
      totalDowntime: formatDuration(totalDowntimeMs),
    };
  };

  /**
   * Handles the 'Yes' or 'No' from the confirmation modal
   */
  const handleConfirmCompletion = async (confirmed) => {
    const { machineId, jobId } = confirmModalData;
    
    if (confirmed && machineId && jobId) {
      const machineToComplete = machines.find((m) => m.id === machineId);
      const jobToComplete = machineToComplete?.currentJobs.find(j => j.jobId === jobId);
      
      if (machineToComplete && jobToComplete) {
        
        // 1. Generate the report for the specific job
        const report = generateReport(machineToComplete, jobToComplete);
        setReportData(report); // Show immediate report
        
        // 2. Save report to Firestore
        if (db && isAuthReady && userId) { // <-- Added check for userId
          try {
            // Use a conditional path for preview vs. production
            const collectionPath = typeof __app_id !== 'undefined' && __app_id !== 'default-app-id'
              ? `artifacts/${appId}/users/${userId}/completedJobs` // <-- Use private user path
              : `completedJobs`;
            await addDoc(collection(db, collectionPath), report);
            console.log("Report saved to database.");
          } catch (e) {
            console.error("Error saving report to database:", e);
          }
        } else {
          console.warn("Firestore not ready, report not saved.");
        }
        
        // 3. Remove the job from the currentJobs list
        const updatedJobs = machineToComplete.currentJobs.filter(
          job => job.jobId !== jobId 
        );

        if (updatedJobs.length === 0) {
          // This was the last job, reset machine to Idle
          handleUpdateMachine({
            ...machineToComplete,
            status: "Idle",
            startTime: null,
            finishTime: null,
            downtimeLog: [],
            currentDowntimeStart: null,
            currentDowntimeDescription: null,
            currentJobs: [],
          });
        } else {
          // Other jobs are still running, just update the list
          handleUpdateMachine({
            ...machineToComplete,
            currentJobs: updatedJobs,
          });
        }
      }
    }
    // Close the confirmation modal regardless
    setConfirmModalData({ machineId: null, jobId: null });
  };
  
  /**
   * Handles searching the database
   */
  const handleSearch = async (searchType, searchValue) => {
    if (!db || !isAuthReady || !userId) { // <-- Added check for userId
      setSearchError("Database not connected. Please wait and try again.");
      return;
    }
    
    // If search value is empty, fetch all jobs instead
    if (!searchValue.trim()) {
      setIsSearching(true);
      await handleFetchAllJobs();
      setIsSearching(false);
      return;
    }
    
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    
    try {
      // Use a conditional path for preview vs. production
      const collectionPath = typeof __app_id !== 'undefined' && __app_id !== 'default-app-id'
        ? `artifacts/${appId}/users/${userId}/completedJobs` // <-- Use private user path
        : `completedJobs`;
      const q = query(collection(db, collectionPath), where(searchType, "==", searchValue));
      
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });
      
      results.sort((a, b) => new Date(b.finishTime) - new Date(a, b)); 
      
      setSearchResults(results);
      
    } catch (e) {
      console.error("Error searching database:", e);
      setSearchError("An error occurred during the search. Please check console.");
    }
    
    setIsSearching(false);
  };
  
  /**
   * Fetches all completed jobs from the database, sorted by date
   */
  const handleFetchAllJobs = async () => {
    if (!db || !isAuthReady || !userId) { // <-- Added check for userId
      setSearchError("Database not connected. Please wait and try again.");
      return;
    }
    
    setSearchError(null);
    setSearchResults([]);
    
    try {
      // Use a conditional path for preview vs. production
      const collectionPath = typeof __app_id !== 'undefined' && __app_id !== 'default-app-id'
        ? `artifacts/${appId}/users/${userId}/completedJobs` // <-- Use private user path
        : `completedJobs`;
      const querySnapshot = await getDocs(collection(db, collectionPath));
      
      const results = [];
      querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });
      
      results.sort((a, b) => new Date(b.finishTime) - new Date(a.finishTime)); 
      
      setSearchResults(results);
      
    } catch (e) {
      console.error("Error fetching all jobs:", e);
      setSearchError("An error occurred while fetching jobs. Please check console.");
    }
  };
  
  /**
   * Opens the search modal and pre-populates it with all jobs
   */
  const handleOpenSearchModal = () => {
    if (!db || !isAuthReady || !userId) { // <-- Added check for userId
      setSearchError("Database not connected. Please wait and try again.");
      setSearchModalOpen(true);
      return;
    }
  
    setSearchModalOpen(true);
    setSearchError(null);
    setSearchResults([]); // Clear old results
    setIsSearching(true); // Show loading spinner
    
    handleFetchAllJobs().finally(() => {
      setIsSearching(false);
    });
  };

  /**
   * Handles clicking on a search result to view it
   */
  const handleViewReport = (report) => {
    setReportToView(report);
    setSearchModalOpen(false); // Close search modal
  };
  
  // --- Main App Render ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 sm:p-8">
      <header className="text-center my-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-green-400">
          Harwell Vacuum Chambers
        </h1>
        <div className="mt-6">
          <button
            onClick={handleOpenSearchModal}
            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition-all"
            disabled={!isAuthReady}
          >
            {isAuthReady ? "Search Completed Jobs" : "Connecting to Database..."}
          </button>
        </div>
      </header>

      <main>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {machines.map((machine) => (
            <MachineCard
              key={machine.id}
              machine={machine}
              onUpdate={handleUpdateMachine}
              onCompleteJobRequest={handleCompleteJobRequest}
              onDowntimeRequest={handleDowntimeRequest}
              onAddJobRequest={handleAddJobRequest}
              onStartMachine={handleStartMachine}
            />
          ))}
        </div>
      </main>

      {/* Modals */}
      {confirmModalData.machineId && (
        <ConfirmationModal onConfirm={handleConfirmCompletion} />
      )}
      
      {addJobModalMachineId && (
        <AddJobModal
          onClose={() => setAddJobModalMachineId(null)}
          onSubmit={handleAddJobSubmit}
        />
      )}

      {downtimeModalMachineId && (
        <DowntimeModal
          onClose={() => setDowntimeModalMachineId(null)}
          onSubmit={handleDowntimeSubmit}
        />
      )}

      {(reportData || reportToView) && (
        <ReportModal 
          reportData={reportToView || reportData} 
          onClose={() => {
            setReportData(null);
            setReportToView(null);
          }} 
        />
      )}
      
      {searchModalOpen && (
        <SearchModal
          onClose={() => {
            setSearchModalOpen(false);
            setSearchResults([]); // Clear results on close
            setSearchError(null);
          }}
          onSearch={handleSearch}
          onViewReport={handleViewReport}
          results={searchResults}
          isSearching={isSearching}
          error={searchError}
        />
      )}
    </div>
  );
}


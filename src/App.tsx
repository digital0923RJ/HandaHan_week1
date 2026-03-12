import { useState } from 'react';
import './App.css';

function App() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={`App${darkMode ? ' dark' : ''}`}>
      <header className="App-header">
        <h1>Korean Learning Hub</h1>
        <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
        </button>
      </header>
      <main className="learning-container">
        <section className="input-section">
          <textarea placeholder="Enter English sentence here..."></textarea>
          <button>Analyze & Explain</button>
        </section>
        <section className="output-section">
          <h2>Korean Expression</h2>
          <div className="result-box"></div>
        </section>
        <section className="explanation-section">
          <h2>Grammar Explanation</h2>
          <div className="result-box"></div>
        </section>
        <section className="practice-section">
          <h2>Practice Problem</h2>
          <div className="result-box"></div>
          <input type="text" placeholder="Enter your English translation..." />
          <button>Check Answer</button>
        </section>
      </main>
    </div>
  );
}

export default App;

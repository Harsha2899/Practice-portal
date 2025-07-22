let questions = [];
let currentQuestionIndex = 0;
let userEmail = "";
let usedHint = false;
let followUpAnswered = new Set();
let answeredQuestions = new Set(); // Stores indices of answered questions
let correctCount = 0;
let incorrectCount = 0;
let selectedSectionQuestions = []; // Holds questions for the currently selected section
let currentSessionId = ""; // NEW: To store a unique ID for the current quiz session

// Make sure this URL is correct and active for your Google Apps Script
const googleAppsScriptURL = 'https://script.google.com/macros/s/AKfycbxs9SaPknPLxBgzBfcYrn4pLmgJKmAA1Coq7y4IV7Qb9EGjFvx1mJSpApEwK8OGd58jGA/exec';

document.addEventListener("DOMContentLoaded", () => {
  fetch("questions.json")
    .then(res => res.json())
    .then(data => {
      questions = data; // Load all questions initially
      showSectionList();
    })
    .catch(err => console.error("Failed to load questions.json:", err));

  document.getElementById("startButton").addEventListener("click", () => {
    userEmail = document.getElementById("emailInput").value.trim();
    if (userEmail && userEmail.includes("@")) {
      currentSessionId = Date.now().toString(); // Generate a unique session ID (e.g., timestamp)
      
      // Set the 'questions' array to only include the selected section's questions
      questions = selectedSectionQuestions; // This line is crucial for filtering
      if (questions.length > 0) {
        showQuestion(currentQuestionIndex);
      } else {
        alert("No questions found for this section.");
        document.getElementById("emailScreen").style.display = "none";
        document.getElementById("home").style.display = "block";
      }
    } else {
      alert("Please enter a valid Gmail address.");
    }
  });

  document.getElementById("showHint").addEventListener("click", () => {
    if (!answeredQuestions.has(currentQuestionIndex)) {
      const q = questions[currentQuestionIndex];
      document.getElementById("hintBox").innerText = q.hint || "";
      document.getElementById("hintBox").classList.add("hint-box");
      usedHint = true;
    }
  });

  document.getElementById("prevButton").addEventListener("click", () => {
    // If current question is unanswered and not the very first, mark as incorrect before navigating
    if (!answeredQuestions.has(currentQuestionIndex) && currentQuestionIndex > 0) {
        markQuestionAsSkipped(currentQuestionIndex);
    }
    if (currentQuestionIndex > 0) {
      showQuestion(--currentQuestionIndex);
    }
  });

  document.getElementById("nextButton").addEventListener("click", () => {
    // If current question is unanswered, mark as incorrect before navigating
    if (!answeredQuestions.has(currentQuestionIndex)) {
        markQuestionAsSkipped(currentQuestionIndex);
    }

    if (currentQuestionIndex < questions.length - 1) {
      showQuestion(++currentQuestionIndex);
    } else {
      // Always show score if "Next" is pressed on the last question
      showScore();
    }
  });
});

function showSectionList() {
  const sectionContainer = document.getElementById("sectionList");
  const uniqueSections = [...new Set(questions.map(q => q.section))].sort((a, b) => a - b);

  const sectionNames = {
    1: "Subject-Verb Agreement",
    2: "Complete Sentences",
    3: "Sentence Fragments",
    4: "What is a Run-on Sentence",
    5: "How to fix Run-on Sentence"
  };

  sectionContainer.innerHTML = "";
  uniqueSections.forEach(section => {
    const btn = document.createElement("button");
    btn.className = "section-button";
    btn.innerText = sectionNames[section] || `Section ${section}`;
    btn.onclick = () => {
      selectedSectionQuestions = questions.filter(q => q.section === section);
      currentQuestionIndex = 0;
      answeredQuestions.clear();
      correctCount = 0;
      incorrectCount = 0;
      followUpAnswered.clear();
      
      // Reset flags/answers on question objects for a fresh start in this section
      selectedSectionQuestions.forEach(q => {
        delete q.userSelectedAnswer;
        delete q.wasCorrectLastTime;
        delete q.lastFeedbackText;
        delete q.followUpNeeded;
        delete q.followUpAnsweredThisTime;
        delete q.lastFollowUpFeedbackText;
        delete q.lastFollowUpAnswerWasCorrect;
        delete q.userSelectedFollowUpAnswer;
        // NEW: Ensure initial states for logging are clear
        q.startTime = null; 
        q.endTime = null;
      });

      document.getElementById("home").style.display = "none";
      document.getElementById("emailScreen").style.display = "block";
    };
    sectionContainer.appendChild(btn);
  });
}

function showQuestion(index) {
  const q = questions[index];
  usedHint = false; // Reset hint usage for the new question
  q.startTime = new Date(); // NEW: Record start time when question is shown

  document.getElementById("emailScreen").style.display = "none";
  document.getElementById("scoreScreen").style.display = "none";
  document.getElementById("questionScreen").style.display = "block";

  document.getElementById("questionNumber").innerText = `Question ${index + 1} of ${questions.length}`;
  document.getElementById("questionText").innerText = q.question;

  const hintBox = document.getElementById("hintBox");
  hintBox.innerText = "";
  hintBox.classList.remove("hint-box");

  const feedbackBox = document.getElementById("feedback");
  feedbackBox.innerText = "";
  feedbackBox.classList.remove("correct", "incorrect");

  const followUpContainer = document.getElementById("followUpContainer");
  followUpContainer.innerHTML = "";
  followUpContainer.style.display = "none";

  const optionsBox = document.getElementById("optionsBox");
  optionsBox.innerHTML = "";
  q.options.forEach((opt, i) => {
    const label = document.createElement("label");
    const radioInput = document.createElement("input");
    radioInput.type = "radio";
    radioInput.name = "option";
    radioInput.value = String.fromCharCode(65 + i);

    radioInput.addEventListener("click", () => handleSubmitAnswer(radioInput.value));

    label.appendChild(radioInput);
    label.append(` ${opt}`);
    optionsBox.appendChild(label);
  });

  const isQuestionAnswered = answeredQuestions.has(index);
  document.getElementById("showHint").disabled = isQuestionAnswered;
  document.getElementById("prevButton").disabled = index === 0;
  document.getElementById("nextButton").disabled = false; // Next button always enabled now

  // If question was already answered, restore visual state
  if (isQuestionAnswered) {
    document.querySelectorAll("input[name='option']").forEach(radio => {
      if (radio.value === q.userSelectedAnswer) {
        radio.checked = true;
      }
      radio.disabled = true;
    });

    feedbackBox.innerText = q.lastFeedbackText;
    feedbackBox.classList.add(q.wasCorrectLastTime ? "correct" : "incorrect");

    if (q.followUpNeeded) {
        showFollowUp(q, true);
    }
  }
}

function handleSubmitAnswer(selectedValue) {
  const q = questions[currentQuestionIndex];
  
  // If already answered, do nothing
  if (answeredQuestions.has(currentQuestionIndex)) {
    return;
  }

  q.endTime = new Date(); // NEW: Record end time
  const timeSpent = (q.endTime - q.startTime) / 1000; // Time in seconds

  const wasCorrect = selectedValue === q.correctAnswer;
  const feedbackBox = document.getElementById("feedback");

  q.userSelectedAnswer = selectedValue;
  q.wasCorrectLastTime = wasCorrect;
  q.lastFeedbackText = usedHint ? (wasCorrect ? q.feedback.correct_hint : q.feedback.incorrect_hint) : (wasCorrect ? q.feedback.correct_no_hint : q.feedback.incorrect_no_hint);

  answeredQuestions.add(currentQuestionIndex);

  feedbackBox.innerText = q.lastFeedbackText;
  if (wasCorrect) {
    feedbackBox.classList.add("correct");
    feedbackBox.classList.remove("incorrect");
    correctCount++;
    if (q.followUpQuestion) {
        q.followUpNeeded = true;
        if (!followUpAnswered.has(q.id)) {
            showFollowUp(q);
        }
    }
  } else {
    feedbackBox.classList.add("incorrect");
    feedbackBox.classList.remove("correct");
    incorrectCount++;
  }

  document.querySelectorAll("input[name='option']").forEach(radio => radio.disabled = true);
  document.getElementById("showHint").disabled = true;

  logAnswer(
    q.section, // Section number
    currentSessionId, // Session ID
    `${currentQuestionIndex + 1}/${questions.length}`, // Q#
    usedHint ? "Yes" : "No", // Used Hint
    selectedValue, // Answer Given
    wasCorrect ? "Correct" : "Incorrect", // Correct (Status)
    timeSpent.toFixed(2), // Time Spent (in seconds)
    q.lastFeedbackText, // Feedback Shown (text of the feedback)
    "N/A", // Follow-up Answer (for main question log)
    "N/A", // Score (for individual question log)
    q.id, // Original question ID
    q.question // Original question text
  );
}

function markQuestionAsSkipped(index) {
    const q = questions[index];
    if (!answeredQuestions.has(index)) {
        q.endTime = new Date();
        const timeSpent = (q.endTime - (q.startTime || new Date())) / 1000; // Use current time if start time not set

        answeredQuestions.add(index);
        incorrectCount++;
        
        q.userSelectedAnswer = "N/A (Skipped)";
        q.wasCorrectLastTime = false;
        q.lastFeedbackText = "❌ Question skipped.";
        
        logAnswer(
            q.section,
            currentSessionId,
            `${index + 1}/${questions.length}`,
            usedHint ? "Yes" : "No", // Hint status for skipped might reflect previous state or be N/A
            "N/A (Skipped)",
            "Skipped",
            timeSpent.toFixed(2),
            q.lastFeedbackText,
            "N/A",
            "N/A",
            q.id,
            q.question
        );
    }
}

function showFollowUp(q, isRevisit = false) {
  const followUp = document.getElementById("followUpContainer");
  followUp.innerHTML = `<p>${q.followUpQuestion}</p>`;

  q.followUpOptions.forEach((opt, i) => {
    const label = document.createElement("label");
    const radioInput = document.createElement("input");
    radioInput.type = "radio";
    radioInput.name = "followUp";
    radioInput.value = String.fromCharCode(65 + i);

    // NEW: Auto-submit follow-up on click
    radioInput.addEventListener("click", () => handleSubmitFollowUp(radioInput.value, q, followUp));

    label.appendChild(radioInput);
    label.append(` ${opt}`);
    followUp.appendChild(label);

    // If revisiting and already answered, pre-select and disable
    if (isRevisit && q.followUpAnsweredThisTime) {
        if (radioInput.value === q.userSelectedFollowUpAnswer) {
            radioInput.checked = true;
        }
        radioInput.disabled = true;
    }
  });

  followUp.style.display = "block";

  // If revisiting and already answered, display feedback immediately
  if (isRevisit && q.followUpAnsweredThisTime) {
        const feedbackParagraph = document.createElement("p");
        feedbackParagraph.innerText = q.lastFollowUpFeedbackText;
        feedbackParagraph.classList.add(q.lastFollowUpAnswerWasCorrect ? "correct" : "incorrect");
        followUp.appendChild(feedbackParagraph);
        followUp.querySelectorAll("input[name='followUp']").forEach(radio => radio.disabled = true);
  }
}

function handleSubmitFollowUp(selectedValue, q, followUpContainer) {
    if (q.followUpAnsweredThisTime) {
        return;
    }

    const correct = selectedValue === q.followUpAnswer;
    const feedbackText = correct ? "✅ Correct!" : "❌ Incorrect." ;
    const feedbackParagraph = document.createElement("p");
    feedbackParagraph.innerText = feedbackText;
    feedbackParagraph.classList.add(correct ? "correct" : "incorrect");
    followUpContainer.appendChild(feedbackParagraph);

    followUpAnswered.add(q.id);

    q.followUpAnsweredThisTime = true;
    q.lastFollowUpFeedbackText = feedbackText;
    q.lastFollowUpAnswerWasCorrect = correct;
    q.userSelectedFollowUpAnswer = selectedValue;

    followUpContainer.querySelectorAll("input[name='followUp']").forEach(radio => radio.disabled = true);

    logAnswer(
        q.section,
        currentSessionId,
        `${currentQuestionIndex + 1}/${questions.length} (Follow-up)`, // Q# for follow-up
        "N/A", // Used Hint (N/A for follow-up as main hint applies to main question)
        selectedValue, // Answer Given
        correct ? "Correct" : "Incorrect", // Correct (Status)
        "N/A", // Time Spent (N/A for follow-up as it's part of main question time)
        feedbackText, // Feedback Shown
        selectedValue, // Follow-up Answer
        "N/A", // Score (for individual question log)
        `${q.id}_followup`, // Original question ID + _followup
        q.followUpQuestion // Follow-up question text
    );
}

// Unified logAnswer function to send data to Apps Script
function logAnswer(
    section,
    sessionId,
    questionNumberDisplay, // e.g., "1/10" or "1/10 (Follow-up)"
    usedHintStatus, // "Yes" / "No" / "N/A"
    answerGiven, // "A", "B", "N/A (Skipped)"
    correctStatus, // "Correct", "Incorrect", "Skipped"
    timeSpent, // Seconds or "N/A"
    feedbackText, // Text feedback shown
    followupAnswerValue, // The selected answer for the follow-up, or "N/A"
    overallScore, // Only for the final score log, otherwise "N/A"
    questionIdInternal, // Internal ID like "q1" or "q1_followup"
    questionTextContent // The full question text
) {
  const payload = {
    action: "logQuestion", // NEW: Action type for Apps Script
    email: userEmail,
    sessionId: sessionId,
    questionNumberDisplay: questionNumberDisplay,
    questionId: questionIdInternal, // To uniquely identify the question in DB
    questionText: questionTextContent, // The full text of the question
    usedHint: usedHintStatus,
    answerGiven: answerGiven,
    correct: correctStatus,
    timeSpent: timeSpent,
    feedbackShown: feedbackText,
    followupAnswer: followupAnswerValue,
    overallScore: overallScore, // This will be "N/A" for question logs, or a percentage for the final score log
    timestamp: new Date().toISOString()
  };

  fetch(googleAppsScriptURL, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" }
  })
  .then(response => response.json())
  .then(data => {
      if (data.status === "success") {
          console.log("Log successful:", data.message);
      } else {
          console.error("Log failed:", data.message);
      }
  })
  .catch(err => console.error("Log failed (network error or script issue):", err));
}

function logFinalScore(finalCorrectCount, finalIncorrectCount, totalQuestions, percentage) {
    const payload = {
        action: "logFinalScore", // NEW: Different action type
        email: userEmail,
        sessionId: currentSessionId,
        totalQuestions: totalQuestions,
        correctCount: finalCorrectCount,
        incorrectCount: finalIncorrectCount,
        percentageScore: percentage,
        timestamp: new Date().toISOString()
    };

    fetch(googleAppsScriptURL, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" }
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            console.log("Final score logged successfully:", data.message);
        } else {
            console.error("Final score log failed:", data.message);
        }
    })
    .catch(err => console.error("Final score log failed (network error or script issue):", err));
}

function showScore() {
  document.getElementById("questionScreen").style.display = "none";
  const scoreScreen = document.getElementById("scoreScreen");
  const finalScore = document.getElementById("finalScore");
  
  const totalQuestions = questions.length;
  const percentage = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(2) : 0;

  finalScore.innerHTML = `
    <h2>Quiz Completed!</h2>
    <p>Correct Answers: ${correctCount}</p>
    <p>Incorrect Answers: ${incorrectCount}</p>
    <p>Score: ${percentage}%</p>
    <button id="restartQuizButton">Take Another Quiz</button>
  `;
  scoreScreen.style.display = "block";

  logFinalScore(correctCount, incorrectCount, totalQuestions, percentage); // NEW: Log final score

  document.getElementById("restartQuizButton").addEventListener("click", () => {
    // Reset all quiz state
    currentQuestionIndex = 0;
    answeredQuestions.clear();
    correctCount = 0;
    incorrectCount = 0;
    usedHint = false;
    followUpAnswered.clear();
    questions = [];
    selectedSectionQuestions = [];
    currentSessionId = ""; // Reset session ID

    document.getElementById("scoreScreen").style.display = "none";
    document.getElementById("emailInput").value = "";
    document.getElementById("emailScreen").style.display = "none";
    document.getElementById("home").style.display = "block";
    fetch("questions.json")
      .then(res => res.json())
      .then(data => {
        questions = data;
        showSectionList();
      })
      .catch(err => console.error("Failed to re-load questions.json:", err));
  });
}

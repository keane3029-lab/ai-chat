// Your Supabase Configuration (Safe to be public in client-side code)
const SUPABASE_URL = "https://fpnayeftqadzotnwrpxe.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwbmF5ZWZ0cWFkem90bndycHxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5MzEyMTcsImV4cCI6MjA5NzUwNzIxN30.b0oJ8pPvKEGgVi-YHfOeAU74-7Rkg0YyLhtbUwQhusk";

let currentChatId = null;

// Standard headers needed to talk to your Supabase REST API
const supabaseHeaders = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

function generateUUID() {
    return crypto.randomUUID();
}

function createNewChat() {
    currentChatId = generateUUID();
    document.getElementById('messagesContainer').innerHTML = '';
    document.getElementById('currentChatTitle').innerText = "Secret Conversation";
    
    const chatList = document.getElementById('chatList');
    const briefId = currentChatId.substring(0, 8);
    chatList.innerHTML = `<div class="sidebar-item active">Chat #${briefId}</div>` + chatList.innerHTML;
}

// Helper to handle OpenRouter API key securely via browser memory
function getOpenRouterKey() {
    let key = localStorage.getItem('OPENROUTER_SECRET_KEY');
    if (!key) {
        key = prompt("Please enter your secret OpenRouter API Key to start chatting:");
        if (key) localStorage.setItem('OPENROUTER_SECRET_KEY', key);
    }
    return key;
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const container = document.getElementById('messagesContainer');
    const messageText = input.value.trim();

    if (!messageText) return;

    // Get the secret OpenRouter key from local storage or prompt
    const openRouterKey = getOpenRouterKey();
    if (!openRouterKey) {
        alert("OpenRouter API key is required to send messages.");
        return;
    }

    if (!currentChatId) createNewChat();

    // 1. Update UI for User Message
    const systemMsg = container.querySelector('.system-message');
    if (systemMsg) systemMsg.remove();
    container.innerHTML += `<div class="message user">${messageText}</div>`;
    input.value = ''; 
    scrollToBottom();

    // 2. Add "Thinking..." Placeholder
    const thinkingId = 'thinking-' + Date.now();
    container.innerHTML += `<div class="message assistant" id="${thinkingId}"><i>Thinking...</i></div>`;
    scrollToBottom();

    try {
        // 3. Save User Message directly to Supabase via PostgREST
        await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ chat_id: currentChatId, role: 'user', content: messageText })
        });

        // 4. Fetch Chat History from Supabase to maintain AI memory
        const historyRes = await fetch(`${SUPABASE_URL}/rest/v1/messages?chat_id=eq.${currentChatId}&order=created_at.asc&limit=10`, {
            method: 'GET',
            headers: supabaseHeaders
        });
        const history = await historyRes.json();

        // 5. Query OpenRouter directly from the browser
        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "google/gemini-2.5-flash",
                messages: history.map(msg => ({ role: msg.role, content: msg.content }))
            })
        });

        const aiData = await openRouterRes.json();
        const aiReply = aiData.choices[0].message.content;

        // 6. Save the AI's reply to Supabase
        await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ chat_id: currentChatId, role: 'assistant', content: aiReply })
        });

        // 7. Render AI response in UI
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) {
            thinkingBubble.innerHTML = aiReply;
            thinkingBubble.removeAttribute('id');
        }

    } catch (error) {
        console.error("Chat error:", error);
        const thinkingBubble = document.getElementById(thinkingId);
        if (thinkingBubble) thinkingBubble.innerText = "Error completing request.";
    }
    
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}
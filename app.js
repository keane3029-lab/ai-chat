const SUPABASE_URL = "https://fpnayeftqadzotnwrpxe.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_XJzqvm5EBghgVGXlxq8JPA_EGErLAeJ"; 

let currentChatId = null;

// Updated headers to perfectly match the modern Supabase gateway specifications
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

function getOpenRouterKey() {
    let key = localStorage.getItem('OPENROUTER_SECRET_KEY');
    if (!key || key === "null" || key.trim() === "") {
        key = prompt("Please enter your secret OpenRouter API Key:");
        if (key) {
            localStorage.setItem('OPENROUTER_SECRET_KEY', key.trim());
        }
    }
    return key;
}

async function sendMessage() {
    const input = document.getElementById('userInput');
    const container = document.getElementById('messagesContainer');
    const messageText = input.value.trim();

    if (!messageText) return;

    const openRouterKey = getOpenRouterKey();
    if (!openRouterKey) {
        alert("OpenRouter API key is required.");
        return;
    }

    if (!currentChatId) createNewChat();

    // 1. Render User Message to UI
    const systemMsg = container.querySelector('.system-message');
    if (systemMsg) systemMsg.remove();
    container.innerHTML += `<div class="message user">${messageText}</div>`;
    input.value = ''; 
    scrollToBottom();

    // 2. Render Loading State
    const thinkingId = 'thinking-' + Date.now();
    container.innerHTML += `<div class="message assistant" id="${thinkingId}"><i>Thinking...</i></div>`;
    scrollToBottom();

    const thinkingBubble = document.getElementById(thinkingId);

    try {
        // 3. Save User Message to Supabase
        const supabaseSave = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ chat_id: currentChatId, role: 'user', content: messageText })
        });
        
        if (!supabaseSave.ok) {
            const errData = await supabaseSave.text();
            throw new Error(`Supabase Save Failed: ${supabaseSave.status} - ${errData}`);
        }

        // 4. Retrieve Conversational History
        const historyRes = await fetch(`${SUPABASE_URL}/rest/v1/messages?chat_id=eq.${currentChatId}&order=created_at.asc&limit=10`, {
            method: 'GET',
            headers: supabaseHeaders
        });
        if (!historyRes.ok) throw new Error(`Supabase Fetch History Failed: ${historyRes.status}`);
        const history = await historyRes.json();

        // 5. Connect to OpenRouter API (Llama 3 Unrestricted Free Tier)
        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openrouter/free",
                messages: history.map(msg => ({ role: msg.role, content: msg.content }))
            })
        });

        const aiData = await openRouterRes.json();
        
        if (aiData.error) {
            throw new Error(`OpenRouter Error: ${aiData.error.message || JSON.stringify(aiData.error)}`);
        }

        const aiReply = aiData.choices[0].message.content;

        // 6. Write AI Response to Database
        await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
            method: 'POST',
            headers: supabaseHeaders,
            body: JSON.stringify({ chat_id: currentChatId, role: 'assistant', content: aiReply })
        });

        // 7. Inject AI Response to UI
        if (thinkingBubble) {
            thinkingBubble.innerHTML = aiReply;
            thinkingBubble.removeAttribute('id');
        }

    } catch (error) {
        console.error("Chat Error Handled:", error);
        if (thinkingBubble) {
            thinkingBubble.innerHTML = `<span style="color: #ff6b6b;"><b>Error:</b> ${error.message}</span>`;
        }
    }
    
    scrollToBottom();
}

function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

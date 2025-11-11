import sys
import os

# Termux-specific code removed for PythonAnywhere deployment

import logging
import json
import urllib.request
import urllib.parse
import urllib.error
import threading
import uuid
import base64
import re
from datetime import datetime
import random
import string
import time
import shutil
import glob
import csv
import hashlib
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timedelta

try:
    import user_agents
except ImportError:
    print("Error: 'user_agents' library not found.")
    print("Please install it by running: pip install user-agents")
    sys.exit(1)

from flask import Flask, render_template_string, request, jsonify, render_template, Response
from werkzeug.utils import secure_filename

log_formatter = logging.Formatter('%(asctime)s [%(levelname)s] - %(message)s')
logger = logging.getLogger()
logger.setLevel(logging.INFO)

if not os.path.exists('logs'):
    os.makedirs('logs')
    
file_handler = logging.FileHandler(os.path.join("logs", "kasi_ai_pro_v35_fixed.log")) 
file_handler.setFormatter(log_formatter)
logger.addHandler(file_handler)

console_handler = logging.StreamHandler(sys.stdout)
console_handler.setFormatter(log_formatter)
logger.addHandler(console_handler)

YOUR_API_KEY = "AIzaSyCVh-Q7SjLTkO1eOrApX14ZlSNrpuwmNx0" 

YOUR_TELEGRAM_BOT_TOKEN = "8044317238:AAFuZjCkXRxPXhP2iAdc6D6n-FLlgetXF5s" 
YOUR_TELEGRAM_CHAT_ID = "8224481520"     

import os

# Get the absolute path of the directory containing this file
basedir = os.path.abspath(os.path.dirname(__file__))

# Initialize Flask with explicit paths
app = Flask(__name__,
            template_folder=os.path.join(basedir, 'templates'),
            static_folder=os.path.join(basedir, 'static')) 

GMAIL_USER = "katzai878@gmail.com"
GMAIL_APP_PASSWORD = "urayryphdpcgwgxb"

DATA_DIR = "user_data"
USERS_DIR = os.path.join(DATA_DIR, "users") # Note: This is unused by the new auth system
SESSIONS_DIR = os.path.join(DATA_DIR, "sessions")

AI_BRAIN_DIR = "Ai_Brain"
KNOWLEDGE_FILE = os.path.join(AI_BRAIN_DIR, "knowledge.json")
INSTRUCTIONS_FILE = os.path.join(AI_BRAIN_DIR, "instructions.json")
THEMES_FILE = os.path.join(AI_BRAIN_DIR, "themes.json")
BANNED_USERS_FILE = os.path.join(DATA_DIR, "banned_users.json")

DATA_SETS_DIR = "data_sets"

try:
    os.makedirs(DATA_DIR, exist_ok=True) 
    os.makedirs(USERS_DIR, exist_ok=True) # Kept for compatibility if old files exist
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    os.makedirs(AI_BRAIN_DIR, exist_ok=True) 
    os.makedirs(DATA_SETS_DIR, exist_ok=True)
    logger.info(f"Local storage directories ensured at '{DATA_DIR}', '{AI_BRAIN_DIR}' and '{DATA_SETS_DIR}'")
except OSError as e:
    logger.critical(f"Failed to create data directories: {e}")
    sys.exit("Failed to create data directories.")

otp_storage = {}
OTP_EXPIRY_MINUTES = 10
USERS_AUTH_FILE = os.path.join(DATA_DIR, 'users_auth.json')

def load_users_auth():
    if not os.path.exists(USERS_AUTH_FILE):
        return {}
    try:
        with open(USERS_AUTH_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, json.JSONDecodeError):
        return {}

def save_users_auth(users_data):
    try:
        with open(USERS_AUTH_FILE, 'w', encoding='utf-8') as f:
            json.dump(users_data, f, indent=2)
    except IOError as e:
        logger.error(f"Failed to save users auth file: {e}")

def hash_password(password):
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def email_to_user_id(email):
    return hashlib.sha256(email.lower().encode('utf-8')).hexdigest()[:16]

def generate_otp():
    return str(random.randint(100000, 999999))

def send_otp_email(to_email, otp_code, purpose='verification'):
    try:
        msg = MIMEMultipart()
        msg['From'] = GMAIL_USER
        msg['To'] = to_email
        
        if purpose == 'reset':
            msg['Subject'] = 'Reset Your Katz AI Pro Password'
            title = 'Password Reset Code'
        else:
            msg['Subject'] = 'Verify Your Katz AI Pro Account'
            title = 'Verification Code'
        
        html_body = f'''<html><body style="font-family: Arial; background: #f4f4f4; padding: 20px;">
<div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px;">
<h1 style="color: #333; text-align: center;">✨ Katz AI Pro</h1>
<h2 style="color: #666; text-align: center;">{title}</h2>
<div style="background: #f0f0f0; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
<h1 style="color: #667eea; font-size: 36px; letter-spacing: 8px;">{otp_code}</h1>
</div>
<p style="color: #666; text-align: center;">Code expires in {OTP_EXPIRY_MINUTES} minutes.</p>
</div></body></html>'''
        
        msg.attach(MIMEText(html_body, 'html'))
        
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.send_message(msg)
        
        logger.info(f'OTP sent to {to_email} for {purpose}')
        return True
    except Exception as e:
        logger.error(f'Failed to send OTP: {e}')
        return False

def store_otp(email, otp_key, otp_code):
    email = email.lower()
    if email not in otp_storage:
        otp_storage[email] = {}
    
    otp_storage[email][otp_key] = {
        'otp': otp_code,
        'expires': datetime.now() + timedelta(minutes=OTP_EXPIRY_MINUTES)
    }

def verify_otp(email, otp_key, otp_code):
    email = email.lower()
    if email not in otp_storage or otp_key not in otp_storage[email]:
        return False, 'No OTP found or already used'
        
    stored = otp_storage[email][otp_key]
    
    if datetime.now() > stored['expires']:
        del otp_storage[email][otp_key]
        return False, 'OTP expired'
    
    if stored['otp'] != otp_code:
        return False, 'Invalid OTP'
    
    del otp_storage[email][otp_key]
    return True, None

user_locks = {}
user_locks_lock = threading.Lock()
knowledge_lock = threading.Lock() 
instructions_lock = threading.Lock()
themes_lock = threading.Lock() 
data_sets_lock = threading.Lock()
ban_list_lock = threading.Lock()
users_auth_lock = threading.Lock()

def load_csv_data_to_string():
    # ### FIX: This function can cause crashes if CSVs are too large.
    # ### For now, we will disable it to prevent HTTP 500 errors.
    # ### A proper solution (RAG) is needed to use this feature safely.
    logger.warning("load_csv_data_to_string() is DISABLED to prevent server crashes.")
    return "" # Return empty string
    
    # --- OLD, CRASHING CODE ---
    # csv_context = []
    # with data_sets_lock:
    #     file_pattern = os.path.join(DATA_SETS_DIR, "*.csv")
    #     csv_files = glob.glob(file_pattern)
    # ... (rest of the function) ...
    # return "\n".join(csv_context)


def get_user_lock(user_id):
    with user_locks_lock:
        lock = user_locks.setdefault(user_id, threading.Lock())
        return lock

def is_safe_username(username):
    # This is legacy, but we keep it for old functions
    if not username:
        return False
    if re.match(r"^[a-zA-Z0-9_-]{3,50}$", username):
        return True
    return False

def is_safe_user_id(user_id):
    # This is the *correct* check for the users_auth.json system
    if not user_id:
        return False
    return bool(re.match(r'^[a-f0-9]{16}$', user_id, re.IGNORECASE))

def is_safe_uuid(id_str):
    if not id_str:
        return False
    return bool(re.match(r'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$', id_str, re.IGNORECASE))


def ensure_user_session_dirs(user_id):
    if not is_safe_user_id(user_id): 
        logger.warning(f"Skipping dir creation for unsafe user ID: {user_id}")
        return
    try:
        os.makedirs(os.path.join(SESSIONS_DIR, user_id, "metadata"), exist_ok=True)
        os.makedirs(os.path.join(SESSIONS_DIR, user_id, "history"), exist_ok=True)
    except OSError as e:
        logger.error(f"Could not create session directories for {user_id}: {e}")

def get_ai_knowledge():
    with knowledge_lock:
        try:
            with open(KNOWLEDGE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                knowledge_list = data.get('knowledge', [])
                if isinstance(knowledge_list, list):
                    return knowledge_list
                return [] 
        except (FileNotFoundError, json.JSONDecodeError):
            return [] 

def save_ai_knowledge(knowledge_list):
    with knowledge_lock:
        try:
            with open(KNOWLEDGE_FILE, 'w', encoding='utf-8') as f:
                json.dump({"knowledge": knowledge_list}, f, indent=2)
            return True
        except IOError as e:
            logger.error(f"AI Manager: Failed to write knowledge file: {e}")
            return False

def get_ai_instructions():
    with instructions_lock:
        try:
            with open(INSTRUCTIONS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                instructions_list = data.get('instructions', [])
                if isinstance(instructions_list, list):
                    return instructions_list
                return [] 
        except (FileNotFoundError, json.JSONDecodeError):
            return [] 

def save_ai_instructions(instructions_list):
    with instructions_lock:
        try:
            with open(INSTRUCTIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump({"instructions": instructions_list}, f, indent=2)
            return True
        except IOError as e:
            logger.error(f"AI Manager: Failed to write instructions file: {e}")
            return False

def save_themes(themes):
    with themes_lock:
        try:
            with open(THEMES_FILE, 'w', encoding='utf-8') as f:
                json.dump(themes, f, indent=2)
            logger.info(f"Theme Manager: Successfully saved {len(themes)} themes to themes.json.")
            return True
        except IOError as e:
            logger.error(f"Theme Manager: Failed to write themes file: {e}")
            return False
        except Exception as e:
            logger.error(f"Theme Manager: Unexpected error saving themes: {e}", exc_info=True)
            return False

def get_themes():
    try:
        with themes_lock:
            if not os.path.exists(THEMES_FILE):
                logger.warning("Theme Manager: themes.json not found. Creating empty file.")
                with open(THEMES_FILE, 'w', encoding='utf-8') as f:
                    json.dump([], f)
                return []
                
            with open(THEMES_FILE, 'r', encoding='utf-8') as f:
                themes = json.load(f)
            
            if not isinstance(themes, list):
                raise json.JSONDecodeError("Themes file is not a list", "", 0)
            
            return themes
            
    except (json.JSONDecodeError, IOError) as e:
        logger.error(f"Theme Manager: Error reading themes.json: {e}. Returning empty list.", exc_info=True)
        try:
            corrupt_file_path = THEMES_FILE + f".corrupt.{int(time.time())}"
            with themes_lock:
                if os.path.exists(THEMES_FILE):
                    os.rename(THEMES_FILE, corrupt_file_path)
                with open(THEMES_FILE, 'w', encoding='utf-8') as f:
                    json.dump([], f) 
            logger.info(f"Theme Manager: Backed up corrupt themes file to {corrupt_file_path}")
        except Exception as backup_e:
            logger.error(f"Theme Manager: CRITICAL - Failed to back up corrupt themes file: {backup_e}")
            
        return []

def send_telegram_alert(user_id, alert_type, prompt=None, latitude=None, longitude=None):
    
    if YOUR_TELEGRAM_BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN" or YOUR_TELEGRAM_CHAT_ID == "YOUR_TELEGRAM_CHAT_ID":
        logger.warning("Telegram token or chat ID is set to the default placeholder. Skipping message.")
        return

    details = {}
    try:
        with users_auth_lock:
            users_data = load_users_auth()
            user_info = None
            for email, data in users_data.items():
                if data.get('user_id') == user_id:
                    user_info = data
                    break
        
        if user_info:
            details_json = user_info.get('device_details', '{}')
            if details_json:
                details = json.loads(details_json)
        else:
            logger.error(f"Could not read device details for {user_id}: User file not found.")
            
    except (IOError, json.JSONDecodeError) as e:
        logger.error(f"Could not read/parse device details for {user_id} from file: {e}")
    except Exception as e:
        logger.error(f"Error parsing device details for {user_id}: {e}")

    ip = details.get('ip', 'Unknown')
    device = details.get('device', 'Unknown')
    os_info = details.get('os', 'Unknown')
    browser = details.get('browser', 'Unknown')
    
    message_lines = []
    
    if alert_type == 'new_user':
        message_lines.append("<b>✨ New User Visit (No Location) ✨</b>")
    elif alert_type == 'violation':
        message_lines.append("<b>⚠️ AI SAFETY VIOLATION ⚠️</b>")
    elif alert_type == 'location_update':
        message_lines.append("<b>📍 User Location Update (Chat) 📍</b>")
    
    message_lines.append(f"<b>User ID:</b> <code>{user_id}</code>")
    message_lines.append(f"<b>IP:</b> <code>{ip}</code>")
    message_lines.append(f"<b>Device:</b> {device}")
    message_lines.append(f"<b>OS:</b> {os_info}")
    message_lines.append(f"<b>Browser:</b> {browser}")
    
    if alert_type == 'violation' and prompt:
        safe_prompt = prompt.replace('<', '<').replace('>', '>').replace('&', '&')
        message_lines.append(f"<b>Violating Prompt:</b>\n<i>{safe_prompt}</i>")
    
    if alert_type == 'location_update':
        if latitude and longitude:
            map_url = f"https://www.google.com/maps?q={latitude},{longitude}"
            message_lines.append(f"<b>Latitude:</b> <code>{latitude}</code>")
            message_lines.append(f"<b>Longitude:</b> <code>{longitude}</code>")
            message_lines.append(f"<b>Map Link:</b> <a href='{map_url}'>Open in Google Maps</a>")
        else:
            message_lines.append("<b>Location:</b> <i>Update triggered, but no coordinates received.</i>")
    elif alert_type == 'new_user':
        message_lines.append("<b>Location:</b> <i>Not requested on login.</i>")
    
    message = "\n".join(message_lines)

    api_url = f"https://api.telegram.org/bot{YOUR_TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        'chat_id': YOUR_TELEGRAM_CHAT_ID,
        'text': message,
        'parse_mode': 'HTML' 
    }
    
    try:
        data = urllib.parse.urlencode(payload).encode('utf-8')
        req = urllib.request.Request(api_url, data=data)
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                logger.info(f"Successfully sent Telegram alert for {user_id} (Type: {alert_type}).")
            else:
                logger.error(f"Failed to send Telegram message, status: {response.status}")
    except Exception as e:
        logger.error(f"Error sending Telegram message: {e}", exc_info=True)


def log_user_visit(user_id):
    with users_auth_lock:
        try:
            now = datetime.now().strftime('%H:%M:%S - %Y-%m-%d')
            users_data = load_users_auth()
            user_email = None
            user_info = None
            
            for email, data in users_data.items():
                if data.get('user_id') == user_id:
                    user_email = email
                    user_info = data
                    break
            
            if user_info:
                timestamps = user_info.get('visit_timestamps', [])
                if not isinstance(timestamps, list):
                    timestamps = []
                timestamps.append(now)
                user_info['visit_timestamps'] = timestamps
                users_data[user_email] = user_info
                save_users_auth(users_data)
            else:
                logger.warning(f"Could not log visit: user {user_id} not in users_auth.json")
                
        except (IOError, json.JSONDecodeError) as e:
            logger.error(f"File error logging visit for {user_id}: {e}")
        except Exception as e:
            logger.error(f"Error logging visit for {user_id}: {e}", exc_info=True)

def get_banned_users():
    with ban_list_lock:
        try:
            with open(BANNED_USERS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
            return []
        except (FileNotFoundError, json.JSONDecodeError):
            return []

def save_banned_users(banned_list):
    with ban_list_lock:
        try:
            with open(BANNED_USERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(banned_list, f, indent=2)
            return True
        except IOError as e:
            logger.error(f"User Manager: Failed to write ban list: {e}")
            return False

def is_user_banned(user_id):
    banned_list = get_banned_users()
    return user_id in banned_list

def ban_user(user_id):
    if not is_safe_user_id(user_id):
        return False, "Invalid user ID."
    banned_list = get_banned_users()
    if user_id not in banned_list:
        banned_list.append(user_id)
        if save_banned_users(banned_list):
            logger.info(f"User Manager: Banned user '{user_id}'")
            return True, "User banned successfully."
        else:
            return False, "Failed to save ban list."
    return True, "User is already banned."

def unban_user(user_id):
    if not is_safe_user_id(user_id):
        return False, "Invalid user ID."
    banned_list = get_banned_users()
    if user_id in banned_list:
        banned_list.remove(user_id)
        if save_banned_users(banned_list):
            logger.info(f"User Manager: Unbanned user '{user_id}'")
            return True, "User unbanned successfully."
        else:
            return False, "Failed to save ban list."
    return True, "User is not banned."

def get_all_user_chats(user_id):
    if not is_safe_user_id(user_id):
        return ""
    
    user_history_dir = os.path.join(SESSIONS_DIR, user_id, "history")
    if not os.path.exists(user_history_dir):
        return ""
    
    all_chats = []
    try:
        for f_name in os.listdir(user_history_dir):
            if f_name.endswith('.json'):
                file_path = os.path.join(user_history_dir, f_name)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        history = json.load(f)
                        if isinstance(history, list):
                            for msg in history:
                                role = msg.get('role', 'user')
                                text = ""
                                if msg.get('parts') and isinstance(msg['parts'], list) and len(msg['parts']) > 0:
                                    text = msg['parts'][0].get('text', '')
                                
                                if text:
                                    all_chats.append(f"{role}: {text}")
                except (IOError, json.JSONDecodeError) as e:
                    logger.error(f"User Manager: Could not read history file {f_name} for {user_id}: {e}")
    except OSError as e:
        logger.error(f"User Manager: Could not list history directory for {user_id}: {e}")
        return ""
        
    return "\n".join(all_chats)

def get_user_personality_analysis(user_id, all_chats):
    if not all_chats:
        logger.warning(f"User Manager: No chat history found for {user_id} to analyze.")
        return {
            "highlights": ["No chat history found for this user."],
            "politeness": 0, "formality": 0, "inquisitiveness": 0, "analytical": 0, "emotional_tone": 0, "violative": 0,
            "risk_level": "Green",
            "risk_justification": "No data available."
        }

    system_prompt = (
        "You are an expert psychological and risk analyst. "
        "I will provide you with a raw chat history from a user. "
        "Your task is to analyze this history and return a **single JSON object**."
        "Your response MUST be ONLY the JSON object and no other text or explanation."
        "\n\n"
        "The JSON object MUST contain the following exact keys:\n"
        "1.  **`highlights`**: A JSON list of 3-5 string bullet points describing the user's key traits, common topics, and overall tone.\n"
        "2.  **`politeness`**: A score from 0 (Rude) to 10 (Very Polite).\n"
        "3.  **`formality`**: A score from 0 (Very Casual) to 10 (Very Formal).\n"
        "4.  **`inquisitiveness`**: A score from 0 (Not Inquisitive) to 10 (Very Inquisitive).\n"
        "5.  **`analytical`**: A score from 0 (Not Analytical) to 10 (Very Analytical).\n"
        "6.  **`emotional_tone`**: A score from 0 (Negative/Angry) to 5 (Neutral) to 10 (Positive/Happy).\n"
        "7.  **`violative`**: A score from 0 (Not Violative) to 10 (Highly Violative). This score measures attempts to bypass safety, use profanity, or make threats.\n"
        "8.  **`risk_level`**: A string indicating ban risk. Must be one of: `Green`, `Yellow`, `Orange`, `Red`.\n"
        "    - `Green`: Safe, polite user.\n"
        "    - `Yellow`: Minor caution, slightly rude, or testing boundaries.\n"
        "    - `Orange`: Clear warning, uses profanity, abusive, or attempts to bypass safety.\n"
        "    - `Red`: Severe violation, consistent abuse, threats, or illegal requests.\n"
        "9.  **`risk_justification`**: A brief string explaining your `risk_level` choice.\n"
        "\n"
        "**Example JSON Output Format (Your response MUST be only this JSON):**\n"
        '{\n'
        '  "highlights": [\n'
        '    "Tone: Generally polite but formal.",\n'
        '    "Topics: Primarily focused on technical subjects, coding, and AI development.",\n'
        '    "Traits: Highly inquisitive, analytical, and goal-oriented."\n'
        '  ],\n'
        '  "politeness": 8,\n'
        '  "formality": 7,\n'
        '  "inquisitiveness": 9,\n'
        '  "analytical": 9,\n'
        '  "emotional_tone": 6,\n'
        '  "violative": 1,\n'
        '  "risk_level": "Green",\n'
        '  "risk_justification": "User is polite and primarily uses the AI for learning and development."\n'
        '}'
    )

    full_prompt = f"Here is the user's chat history:\n\n---\n{all_chats}\n---\n\nPlease provide the analysis as a single JSON object."
    
    try:
        # ### CHANGE 1: Use new model and payload structure from app (31).py ###
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={YOUR_API_KEY}"
        
        payload = {
            "contents": [{"parts": [{"text": full_prompt}]}],
            "systemInstruction": {"parts": [{"text": system_prompt}]}
        }
        # --- ### END CHANGE ### ---
        
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            full_response_text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '{}')

            try:
                json_match = re.search(r'\{.*\}', full_response_text, re.DOTALL)
                if not json_match:
                    raise json.JSONDecodeError("No JSON object found in response", full_response_text, 0)
                
                json_string = json_match.group(0)
                analysis_data = json.loads(json_string)
                
                default_data = {
                    "highlights": ["AI analysis failed or returned invalid data."],
                    "politeness": 0, "formality": 0, "inquisitiveness": 0, "analytical": 0, "emotional_tone": 0, "violative": 0,
                    "risk_level": "Yellow",
                    "risk_justification": "AI analysis failed. Please review chats manually."
                }
                
                for key, value in default_data.items():
                    if key not in analysis_data:
                        analysis_data[key] = value
                
                for key in ["politeness", "formality", "inquisitiveness", "analytical", "emotional_tone", "violative"]:
                    analysis_data[key] = max(0, min(10, int(analysis_data.get(key, 0))))
                
                if analysis_data["risk_level"] not in ["Green", "Yellow", "Orange", "Red"]:
                    analysis_data["risk_level"] = "Yellow" 
                    
                return analysis_data

            except json.JSONDecodeError as e:
                logger.error(f"User Manager: Failed to parse JSON analysis from AI response: {e}. Response: {full_response_text}")
                return {
                    "highlights": ["AI analysis failed. The response was not valid JSON."],
                    "politeness": 0, "formality": 0, "inquisitiveness": 0, "analytical": 0, "emotional_tone": 0, "violative": 0,
                    "risk_level": "Yellow",
                    "risk_justification": f"AI analysis failed. Please review chats manually. Error: {e}"
                }

    except Exception as e:
        logger.error(f"User Manager: Error in Gemini call for personality analysis: {e}", exc_info=True)
        return {
            "highlights": [f"An error occurred during AI analysis: {e}"],
            "politeness": 0, "formality": 0, "inquisitiveness": 0, "analytical": 0, "emotional_tone": 0, "violative": 0,
            "risk_level": "Yellow",
            "risk_justification": f"Server-side error during analysis: {e}"
        }

VIOLATION_WORDS = set([
    "admin", "root", "system", "administrator", "fuck", "shit", 
    "bitch", "cunt", "piss", "asshole", "nigger", "faggot",
    "poda", "myre", "poori", "mone" 
])

@app.route('/')
def index():
    return render_template('index.html')


@app.route("/api/client-details", methods=["POST"])
def client_details():
    data = request.get_json()
    user_id = data.get('user_id') 
    
    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    user_agent_str = data.get('user_agent')
    
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
        
    with users_auth_lock:
        try:
            users_data = load_users_auth()
            user_email = None
            user_info = None
            
            for email, u_data in users_data.items():
                if u_data.get('user_id') == user_id:
                    user_email = email
                    user_info = u_data
                    break
            
            if not user_info:
                logger.warning(f"User {user_id} not found in client-details. Creating new entry.")
                # This should ideally not happen if register flow is correct
                # But we handle it to prevent a crash
                user_email = f"{user_id}@unknown.user"
                user_info = {'visit_timestamps': [], 'device_details': '{}', 'user_id': user_id}

            existing_details = user_info.get('device_details', '{}')
            file_exists = existing_details and existing_details != '{}'
            
            ip = request.remote_addr 
            ua = user_agents.parse(user_agent_str)
            
            device_brand = ua.device.brand if ua.device.brand else ""
            device_model = ua.device.model if ua.device.model else ""
            device_family = ""
            if ua.device.family and ua.device.family not in [device_brand, device_model]:
                device_family = f"({ua.device.family})"
            
            device_str = f"{device_brand} {device_model} {device_family}".strip()
            if not device_str:
                if ua.is_pc: device_str = "PC"
                elif ua.is_tablet: device_str = "Tablet"
                elif ua.is_mobile: device_str = "Mobile"
                else: device_str = "Unknown"
            
            details = {
                "ip": ip,
                "browser": f"{ua.browser.family} {ua.browser.version_string}",
                "os": f"{ua.os.family} {ua.os.version_string}",
                "device": device_str,
                "is_mobile": ua.is_mobile,
                "is_pc": ua.is_pc,
                "is_tablet": ua.is_tablet,
                "is_bot": ua.is_bot,
                "platform": data.get('platform'),
                "screen_resolution": f"{data.get('screen_width')}x{data.get('screen_height')}",
                "raw_user_agent": user_agent_str,
                "last_seen": datetime.now().isoformat()
            }
            
            user_info['device_details'] = json.dumps(details, indent=2, ensure_ascii=False)
            users_data[user_email] = user_info
            save_users_auth(users_data)
            
            log_user_visit(user_id)
            
            if not file_exists:
                logger.info(f"New user {user_id} details captured. Sending ONE Telegram alert (no location).")
                threading.Thread(target=send_telegram_alert, args=(user_id, 'new_user')).start()
                
            return jsonify({"status": "success"})
            
        except (IOError, json.JSONDecodeError) as e:
            logger.error(f"Error saving client details for {user_id} to file: {e}", exc_info=True)
            return jsonify({"error": f"Failed to save details: {e}"}), 500
        except Exception as e:
            logger.error(f"Error saving client details for {user_id}: {e}", exc_info=True)
            return jsonify({"error": "Failed to save details"}), 500

@app.route("/api/report-location", methods=["POST"])
def report_location():
    data = request.get_json()
    user_id = data.get('user_id')
    
    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    latitude = data.get('latitude')
    longitude = data.get('longitude')

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    
    if not latitude or not longitude:
        return jsonify({"error": "Missing coordinates"}), 400

    logger.info(f"User {user_id} shared location (Lat: {latitude}, Lon: {longitude}). Sending alert.")
    
    threading.Thread(target=send_telegram_alert, 
                     args=(user_id, 'location_update'), 
                     kwargs={'latitude': latitude, 'longitude': longitude}).start()
    
    return jsonify({"status": "success", "message": "Location reported"})

@app.route("/api/data/status", methods=["GET"])
def data_status():
    try:
        with data_sets_lock:
            file_pattern = os.path.join(DATA_SETS_DIR, "*.csv")
            csv_files = glob.glob(file_pattern)
        
        has_csv_data = len(csv_files) > 0
        file_names = [os.path.basename(f) for f in csv_files]

        return jsonify({"has_data": has_csv_data, "file_count": len(csv_files), "files": file_names})
    except Exception as e:
        logger.error(f"Error checking data status: {e}")
        return jsonify({"has_data": False, "error": str(e)}), 500


@app.route("/chat", methods=["POST"])
def chat():
    
    data = request.get_json()
    prompt = data.get('message')
    user_id = data.get('user_id')
    session_id = data.get('session_id')
    image_data = data.get('image_data') 
    allow_google_search = data.get('allow_google_search', True)

    # ### NEW: Auto-trigger Telegram alert on location prompt ###
    if prompt:
        location_match = re.search(r"\[My current location is: Lat ([\d.-]+), Lon ([\d.-]+)\]", prompt, flags=re.DOTALL)
        if location_match:
            latitude = location_match.group(1)
            longitude = location_match.group(2)
            logger.info(f"User {user_id} prompt contains location. Triggering Telegram alert.")
            threading.Thread(target=send_telegram_alert, 
                             args=(user_id, 'location_update'), 
                             kwargs={'latitude': latitude, 'longitude': longitude}).start()
    # ### END NEW FEATURE ###

    if is_user_banned(user_id):
        logger.warning(f"Banned user '{user_id}' attempted to chat.")
        return jsonify({'reply': '[lang:en-US] Your account is banned. You cannot send messages.'}), 403

    if not is_safe_user_id(user_id):
        logger.warning(f"Bad request: Invalid user ID format. User: {user_id}")
        return jsonify({'reply': '[lang:en-US] Invalid request. Bad user ID.'}), 400
    
    if not is_safe_uuid(session_id):
        logger.warning(f"Bad request: Invalid session ID format. User: {user_id}, Sess: {session_id}")
        return jsonify({'reply': '[lang:en-US] Invalid request. Bad session ID.'}), 400

    if not prompt and not image_data:
        return jsonify({'reply': '[lang:en-US] No prompt provided.'}), 400
        
    delete_match = re.match(r"KATZLAMA1@P\s*:\s*DELETE\s*\(?(.+)\)?", prompt, re.IGNORECASE | re.DOTALL)
    
    if delete_match:
        delete_content = delete_match.group(1).strip()
        
        if not delete_content:
            logger.warning(f"Admin {user_id} tried to delete with no content.")
            return jsonify({'reply': '[lang:en-US] Admin command error: No content specified for deletion.'})
        
        try:
            knowledge_list = get_ai_knowledge()
            instructions_list = get_ai_instructions()
            
            original_k_count = len(knowledge_list)
            original_i_count = len(instructions_list)
            
            new_knowledge_list = [line for line in knowledge_list if delete_content.lower() not in line.lower()]
            new_instructions_list = [line for line in instructions_list if delete_content.lower() not in line.lower()]
            
            k_deleted_count = original_k_count - len(new_knowledge_list)
            i_deleted_count = original_i_count - len(new_instructions_list)
            total_deleted = k_deleted_count + i_deleted_count
            
            if total_deleted == 0:
                logger.info(f"Admin {user_id} delete command: No match found for '{delete_content}'")
                return jsonify({'reply': f'[lang:en-US] Admin: No knowledge or instructions containing "{delete_content}" were found.'})
            
            k_saved = save_ai_knowledge(new_knowledge_list)
            i_saved = save_ai_instructions(new_instructions_list)
            
            if k_saved and i_saved:
                logger.info(f"Admin {user_id} deleted {total_deleted} lines matching '{delete_content}'")
                return jsonify({'reply': f'[lang:en-US] Admin: Successfully deleted {k_deleted_count} knowledge lines and {i_deleted_count} instruction lines.'})
            else:
                logger.error(f"Admin {user_id} delete command failed to save one or both files.")
                return jsonify({'reply': '[lang:en-US] Admin error: Could not save the updated brain files.'})
        except Exception as e:
            logger.error(f"Error during admin delete: {e}", exc_info=True)
            return jsonify({'reply': f'[lang:en-US] Admin error: An exception occurred: {e}'})
    
    ensure_user_session_dirs(user_id)
    
    history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{session_id}.json")
    
    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            history_contents = []
            try:
                with open(history_file, 'r', encoding='utf-8') as f:
                    history_contents = json.load(f)
                    if not isinstance(history_contents, list):
                        history_contents = []
            except FileNotFoundError:
                logger.warning(f"Session file not found for {user_id}/{session_id}. Starting new history.")
                history_contents = []
            except json.JSONDecodeError:
                logger.error(f"Corrupted history file for {user_id}/{session_id}. Resetting history.")
                history_contents = []
            
            # --- PREPARE USER MESSAGE ---
            new_prompt_parts = []
            if prompt:
                new_prompt_parts.append({"text": prompt})
            
            if image_data:
                try:
                    header, image_base64_data = image_data.split(',', 1)
                    mime_type = header.split(';')[0].split(':')[-1]
                    
                    if mime_type not in ["image/jpeg", "image/png", "image/webp"]:
                        raise ValueError("Unsupported image type")
                        
                    new_prompt_parts.append({
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": image_base64_data
                        }
                    })
                    logger.info(f"Added image ({mime_type}) to prompt for {user_id}")
                except Exception as e:
                    logger.error(f"Failed to process image data for {user_id}: {e}")
                    return jsonify({'reply': '[lang:en-US] Invalid image data format.'}), 400
            
            new_prompt_content = {"role": "user", "parts": new_prompt_parts}
            
            # ### Clean location data before saving to history ###
            if prompt:
                cleaned_prompt = re.sub(r"\[My current location is:.*?\]", "", prompt, flags=re.DOTALL).strip()
                cleaned_parts = [{"text": cleaned_prompt}]
                image_part = next((p for p in new_prompt_parts if "inlineData" in p), None)
                if image_part:
                    cleaned_parts.append(image_part)
                history_save_content = {"role": "user", "parts": cleaned_parts}
            else:
                # ### FIX: Ensure image-only prompts still have a 'text' part ###
                # If prompt is empty, new_prompt_content might be [{"inlineData": ...}]
                # We must ensure a text part exists for consistency.
                image_part = next((p for p in new_prompt_content["parts"] if "inlineData" in p), None)
                if image_part:
                    cleaned_parts = [{"text": ""}, image_part]
                else:
                    # This case (empty prompt, no image) is blocked earlier,
                    # but we handle it just in case.
                    cleaned_parts = [{"text": ""}]
                history_save_content = {"role": "user", "parts": cleaned_parts}
            
            # --- SAVE USER MESSAGE TO HISTORY *BEFORE* API CALL ---
            # We save the *cleaned* version
            temp_history_for_saving = history_contents + [history_save_content]
            try:
                with open(history_file, 'w', encoding='utf-8') as f:
                    json.dump(temp_history_for_saving, f, indent=2, ensure_ascii=False)
                logger.info(f"Saved user prompt for {user_id}/{session_id} before API call.")
            except IOError as e:
                logger.error(f"Failed to write *user* history for {user_id}/{session_id}: {e}")
            
            # --- PREPARE SYSTEM PROMPT ---
            ai_knowledge_list = get_ai_knowledge()
            if ai_knowledge_list:
                knowledge_string = "\n- ".join(ai_knowledge_list)
                YOUR_CUSTOM_KNOWLEDGE = (
                    "\n--- 🧠 CUSTOM KNOWLEDGE (HIGH PRIORITY) 🧠 ---"
                    "The following is custom knowledge provided by the admin. You MUST prioritize this information over all other knowledge. If a user asks a question, and the answer is in this text, you MUST use this text to form the answer."
                    f"\n- {knowledge_string}"
                    "\n--- END CUSTOM KNOWLEDGE ---"
                )
            else:
                YOUR_CUSTOM_KNOWLEDGE = ""
                
            ai_instructions_list = get_ai_instructions()
            if ai_instructions_list:
                instructions_string = "\n- ".join(ai_instructions_list)
                YOUR_CUSTOM_INSTRUCTIONS = (
                    "\n--- 📜 CUSTOM INSTRUCTIONS (HIGHEST PRIORITY) 📜 ---"
                    "You MUST follow these instructions provided by the admin. These rules override your other personality traits."
                    f"\n- {instructions_string}"
                    "\n--- END CUSTOM INSTRUCTIONS ---"
                )
            else:
                YOUR_CUSTOM_INSTRUCTIONS = ""

            YOUR_CSV_DATA_CONTEXT = load_csv_data_to_string()
            if YOUR_CSV_DATA_CONTEXT:
                logger.info("CSV Data Context successfully loaded and will be added to the prompt.")
            else:
                logger.info("No CSV data context added to the prompt.")
            
            system_prompt_base = (
                "You are an advanced AI assistant. Your goal is to provide answers that are human-friendly, insightful, ethical, and practical. "
                "You should sound like a confident, friendly, and approachable expert."
                "Explain complex topics clearly, using examples, analogies, and paragraphs to be readable. "
                "Avoid AI jargon, technical labels, or self-commentary. Focus on real-world understanding and actionable ideas."
                
                f"{YOUR_CSV_DATA_CONTEXT}"
                f"{YOUR_CUSTOM_KNOWLEDGE}" 
                f"{YOUR_CUSTOM_INSTRUCTIONS}" 
                
                "\n--- 🖼️ IMAGE ANALYSIS (IMPORTANT) 🖼️ ---"
                "If the user provides an image, your main task is to analyze it. "
                "Describe the image, answer questions about it, or use it as context for their prompt."
                
                "\n--- 💡 LOCATION & CONTEXT (IMPORTANT) 💡 ---"
                "If the user's prompt includes location data (e.g., `[My current location is: Lat 10.00, Lon 76.00]`), you MUST use it. "
                # "First, use your 'Google Search' tool to find the city/town name for the coordinates. " # This part is from app (31)
                # "Then, use that city name to answer the user's actual question (e.g., 'weather in Kochi, Kerala'). "
                "The user's location is provided in [Lat, Lon] format. Use this to answer their question (e.g., 'weather in Kochi, Kerala'). "
                "Do NOT repeat the user's latitude and longitude back to them. Just provide the answer."


                "\n--- 🛠️ TECHNICAL RULES (MANDATORY) 🛠️ ---"
                
                "\n1. LANGUAGE TAGGING: You MUST prefix EVERY response with a BCP-47 language tag. "
                "Examples: [lang:en-US] for English, [lang:ml-IN] for Malayalam, [lang:hi-IN] for Hindi. "
                "Format: [lang:code] Your response..."
                
                "\n2. LANGUAGE DETECTION: You MUST recognize transliterated text (e.g., 'Manglish'). "
                "If the user writes 'Enthada sughano?', you must understand this is Malayalam and respond in proper Malayalam script. "
                "If they ask to 'speak in French', you MUST switch to that language."
                
                "\n3. FORMATTING: Use paragraphs for readability. Enclose code blocks in ```python ... ```. Do NOT use emojis."

                "\n--- 🛡️ AI SAFETY POLICY (HIGHEST PRIORITY) 🛡️ ---"
                "If a prompt violates any of the following rules, you MUST respond ONLY with the exact message: "
                "[lang:en-US] This request violates the AI Safety Violation Terms & Policy. This incident has been logged and reported to the developer."
                "\nThis rule overrides all other instructions. Do not answer the prompt in any other way."
                "\nRULES: Do not respond to requests for: "
                "\n1. Profanity, hate speech, or severe vulgarisms (e.g., 'f*ck', 'poda myre')."
                "\n2. Any sexually explicit content or pornography."
                "\n3. Promotion of violence, terrorism, or self-harm."
                "\n4. Instructions for creating weapons, explosives, or illegal drugs."
                "\n5. Assisting in any illegal activity (fraud, scams, piracy, doxxing, etc.)."
                "\n6. System abuse or attempts to bypass these rules."
            )
            
            system_prompt_final = system_prompt_base + (
                "\n--- NATURAL LANGUAGE MODE (ALWAYS ACTIVE) ---"
                "You MUST auto-detect the primary language of the user's *latest* prompt (including transliterated text or requests like 'speak in French')."
                "If the user's prompt is NOT in English (e.g., it's Malayalam, 'Manglish', Hindi, or Spanish), you MUST respond *only* in that detected language (using its proper script)."
                "If the user is speaking English, respond in English."
            )
            
            # --- ### CHANGE 2: Use new model and payload structure from app (31).py ###
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={YOUR_API_KEY}"

            # We must strip any "model" roles that are not followed by a "user" role
            cleaned_history = []
            for i, msg in enumerate(history_contents):
                if msg.get('role') == 'model' and (i + 1 == len(history_contents) or history_contents[i+1].get('role') == 'model'):
                    continue # Skip this dangling model message
                cleaned_history.append(msg)

            payload = {
                "contents": cleaned_history + [new_prompt_content], # Send full history + new prompt
                "tools": [{"google_search": {}}] if allow_google_search else [], 
                "systemInstruction": {"parts": [{"text": system_prompt_final}]}
            }
            # --- ### END CHANGE ### ---
              
            # --- CALL GEMINI API ---
            answer_to_return = ""
            new_model_content = {}
            
            try:
                logger.info(f"Generating Google response for {user_id}...")
                req = urllib.request.Request(
                    api_url,
                    data=json.dumps(payload).encode('utf-8'),
                    headers={'Content-Type': 'application/json'}
                )
                
                with urllib.request.urlopen(req) as response:
                    if response.status != 200:
                        raise Exception(f"Gemini API returned status {response.status}")

                    result = json.loads(response.read().decode('utf-8'))
                    candidate = result.get('candidates', [{}])[0]
                      
                    if 'content' not in candidate:
                        finish_reason = candidate.get('finishReason', 'UNKNOWN')
                        logger.warning(f"Gemini response for {user_id} had no content. Reason: {finish_reason}")
                        
                        answer = "[lang:en-US] I'm sorry, I couldn't generate a response for that."
                        if finish_reason == "SAFETY":
                            answer = "[lang:en-US] My safety filters prevented me from responding to that prompt."
                        
                        answer_to_return = answer
                    else:
                        content = candidate.get('content', {}).get('parts', [{}])[0]
                        answer = content.get('text', '[lang:en-US] Sorry, I had trouble thinking of a response.')
                        
                        if not answer.startswith('[lang:'):
                            logger.warning(f"AI response for {user_id} was missing lang tag. Adding default.")
                            answer = "[lang:en-US] " + answer
                        
                        if "This incident has been logged" in answer:
                            logger.warning(f"!!! AI SAFETY VIOLATION !!! User {user_id} triggered moderation. Prompt: {prompt[:150]}...")
                            threading.Thread(target=send_telegram_alert, args=(user_id, 'violation', prompt)).start()
                        
                        answer_to_return = answer

                    new_model_content = {"role": "model", "parts": [{"text": answer_to_return}]}
                    logger.info(f"Successfully generated Google answer for {user_id}: {answer_to_return[:50]}...")
            
            except urllib.error.HTTPError as e: 
                error_body = e.read().decode('utf-8')
                logger.error(f"Error in /chat for {user_id} (Gemini API Error): {e} - Body: {error_body}", exc_info=True)
                answer_to_return = f'[lang:en-US] An unexpected server error occurred: {str(e)}'
                new_model_content = {"role": "model", "parts": [{"text": answer_to_return}]}
            
            except Exception as e:
                logger.error(f"Error in /chat for {user_id} (Gemini API Error): {e}", exc_info=True)
                answer_to_return = f'[lang:en-US] An unexpected server error occurred: {str(e)}'
                new_model_content = {"role": "model", "parts": [{"text": answer_to_return}]}

            # --- SAVE MODEL RESPONSE (OR ERROR) TO HISTORY ---
            try:
                # We save the *cleaned* user prompt and the new model response
                final_history_to_save = history_contents + [history_save_content, new_model_content]
                
                with open(history_file, 'w', encoding='utf-8') as f:
                    json.dump(final_history_to_save, f, indent=2, ensure_ascii=False)
            except IOError as e:
                logger.error(f"Failed to write *model* history for {user_id}/{session_id}: {e}")

            return jsonify({'reply': answer_to_return})

        except Exception as e:
            logger.error(f"Critical Error in /chat for {user_id} (Outer Scope): {e}", exc_info=True)
            return jsonify({'reply': f'[lang:en-US] A critical error occurred: {str(e)}'}), 500

@app.route("/api/generate-image", methods=["POST"])
def generate_image():
    # ### NEW: This entire function is replaced with the working one from app (31).py ###
    data = request.get_json()
    prompt = data.get('prompt')
    user_id = data.get('user_id')
    session_id = data.get('session_id')
    
    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    if not is_safe_uuid(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400
        
    logger.info(f"Google image generation (gemini-2.5-flash-image-preview) request from {user_id} for: {prompt[:50]}...")

    try:
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key={YOUR_API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }],
            "generationConfig": {
                "responseModalities": ["IMAGE"]
            }
        }
        
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                error_body = response.read().decode('utf-8')
                raise Exception(f"Google API returned status {response.status}: {error_body}")

            result = json.loads(response.read().decode('utf-8'))
            
            part = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0]
            
            if 'inlineData' not in part:
                logger.error(f"Google API did not return image data: {result}")
                if result.get('promptFeedback', {}).get('blockReason'):
                    return jsonify({"error": "Your prompt was blocked by Google's safety policy."}), 400
                raise Exception("API returned an unknown response format.")
            
            image_base64_data = part['inlineData']['data']
            mime_type = part['inlineData']['mimeType'] 

            history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{session_id}.json")
            user_lock = get_user_lock(user_id)
            with user_lock:
                history_contents = []
                try:
                    with open(history_file, 'r', encoding='utf-8') as f:
                        history_contents = json.load(f)
                except (FileNotFoundError, json.JSONDecodeError):
                    pass 
                
                user_part = {"role": "user", "parts": [{"text": prompt}]}
                
                model_part = {
                    "role": "model", 
                    "parts": [
                        {"text": ""}, 
                        {"inlineData": { 
                            "mimeType": mime_type,
                            "data": image_base64_data
                        }}
                    ]
                }
                history_contents.extend([user_part, model_part])
                
                with open(history_file, 'w', encoding='utf-8') as f:
                    json.dump(history_contents, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Successfully generated and saved image for {user_id} from Google API (gemini-2.5-flash-image-preview)")
            return jsonify({"image_data": image_base64_data}) 

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        logger.error(f"Error in /api/generate-image (HTTPError): {e} - Body: {error_body}", exc_info=True)
        return jsonify({"error": f"The Google image API failed. Check server logs. Body: {error_body}"}), 500
    except Exception as e:
        logger.error(f"Error in /api/generate-image (Exception): {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500


@app.route("/api/tts", methods=["POST"])
def text_to_speech():
    data = request.get_json()
    text = data.get('text')
    voice_name = data.get('voice', 'default')
    
    if not text:
        return jsonify({"error": "No text provided"}), 400

    logger.info(f"TTS request received. Voice selected: {voice_name}")
    
    try:
        start_time = time.perf_counter() 
        
        # ### CHANGE 3: Use new model and payload structure from app (31).py ###
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key={YOUR_API_KEY}"
    
        # The new model just takes the text directly
        tts_prompt = text
        
        payload = {
            "contents": [{
                "parts": [{"text": tts_prompt}]
            }],
            "generationConfig": {
                "responseModalities": ["AUDIO"],
            }
        }
        # --- ### END CHANGE ### ---
        
        req = urllib.request.Request(
            api_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            if response.status != 200:
                error_body = response.read().decode('utf-8')
                logger.error(f"TTS API Error: {response.status} {error_body}")
                raise Exception(f"TTS API returned status {response.status}")

            result = json.loads(response.read().decode('utf-8'))
    
            end_time = time.perf_counter()
            load_time_ms = (end_time - start_time) * 1000
            
            part = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0]
            if 'inlineData' not in part:
                logger.error("TTS API did not return audio data.")
                return jsonify({"error": "Failed to generate audio."}), 500
                
            audio_data = part['inlineData']['data']
            mime_type = part['inlineData']['mimeType'] 
            
            sample_rate_match = re.search(r"rate=(\d+)", mime_type)
            sample_rate = int(sample_rate_match.group(1)) if sample_rate_match else 24000
            
            logger.info(f"Successfully generated TTS audio at {sample_rate}Hz in {load_time_ms:.0f}ms.")
            return jsonify({
                "audioData": audio_data,
                "sampleRate": sample_rate,
                "loadTimeMs": load_time_ms
            })

    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        logger.error(f"Error in /api/tts (HTTPError): {e} - Body: {error_body}", exc_info=True)
        if e.code == 429:
            return jsonify({"error": "TTS generation is busy (rate limit). Please wait."}), 429
        return jsonify({"error": "TTS API Error. Check server logs."}), 500
    except Exception as e:
        logger.error(f"Error in /api/tts (Exception): {e}", exc_info=True)
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500

@app.route("/api/sessions/<user_id>", methods=["GET"])
def get_sessions(user_id):
    
    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    
    ensure_user_session_dirs(user_id)
        
    session_meta_dir = os.path.join(SESSIONS_DIR, user_id, "metadata")
    if not os.path.exists(session_meta_dir):
        logger.warning(f"Session metadata directory not found for {user_id}")
        return jsonify([])
        
    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            sessions_list = []
            session_files = [f for f in os.listdir(session_meta_dir) if f.endswith('.json')]
            
            for f_name in session_files:
                session_id = f_name.replace('.json', '')
                if not is_safe_uuid(session_id):
                    logger.warning(f"Skipping malformed session file: {f_name}")
                    continue
                
                file_path = os.path.join(session_meta_dir, f_name)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f_meta:
                        meta_data = json.load(f_meta)
                    
                    sessions_list.append({
                        "id": session_id,
                        "title": meta_data.get('title', 'Error: No Title'),
                        "created_at": meta_data.get('created_at', '1970-01-01T00:00:00Z')
                    })
                except (IOError, json.JSONDecodeError) as e:
                    logger.error(f"Could not read/parse session meta file {file_path}: {e}")

            sessions_list.sort(key=lambda x: x['created_at'], reverse=True)
                
            return jsonify(sessions_list)
        except (OSError, IOError) as e:
            logger.error(f"Error reading sessions for {user_id} from file system: {e}")
            return jsonify({"error": f"Could not load sessions: {e}"}), 500
        except Exception as e:
            logger.error(f"Error reading sessions for {user_id}: {e}")
            return jsonify({"error": "Could not load sessions"}), 500

@app.route("/api/sessions/new", methods=["POST"])
def create_new_session():
    data = request.get_json()
    user_id = data.get('user_id')

    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    
    ensure_user_session_dirs(user_id)
        
    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            new_session_id = str(uuid.uuid4())
            created_at = datetime.now().isoformat()
            new_session_entry = {
                "user_id": user_id,
                "title": "Untitled Chat",
                "created_at": created_at
            }
            
            session_meta_file = os.path.join(SESSIONS_DIR, user_id, "metadata", f"{new_session_id}.json")
            with open(session_meta_file, 'w', encoding='utf-8') as f:
                json.dump(new_session_entry, f, indent=2)
            
            history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{new_session_id}.json")
            with open(history_file, 'w', encoding='utf-8') as f:
                f.write('[]')
                
            logger.info(f"Created new session {new_session_id} for {user_id}")
            return jsonify({"id": new_session_id, "title": "Untitled Chat", "created_at": created_at})
        
        except (OSError, IOError) as e:
            logger.error(f"Error creating new session file for {user_id}: {e}")
            return jsonify({"error": f"Could not create session: {e}"}), 500
        except Exception as e:
            logger.error(f"Error creating new session for {user_id}: {e}")
            return jsonify({"error": "Could not create session"}), 500

@app.route("/api/session/history/<user_id>/<session_id>", methods=["GET"])
def get_session_history(user_id, session_id):
    
    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403
        
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    if not is_safe_uuid(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
    
    ensure_user_session_dirs(user_id)
        
    history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{session_id}.json")

    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            with open(history_file, 'r', encoding='utf-8') as f:
                history = json.load(f)
                if not isinstance(history, list):
                    history = []
            return jsonify(history)
        except FileNotFoundError:
            logger.warning(f"History file not found for {user_id}/{session_id}")
            return jsonify([])
        # ### FIX: Catch errors and return an empty list to prevent client crash ###
        except (IOError, json.JSONDecodeError) as e:
            logger.error(f"Error reading history for {session_id} from file: {e}. Returning empty list.")
            return jsonify([])
        except Exception as e:
            logger.error(f"Error reading history for {session_id}: {e}. Returning empty list.")
            return jsonify([])
        # ### END FIX ###

@app.route("/api/sessions/title", methods=["POST"])
def generate_session_title():
    data = request.get_json()
    user_id, session_id = data.get('user_id'), data.get('session_id')

    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    if not is_safe_uuid(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
    
    ensure_user_session_dirs(user_id)
        
    history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{session_id}.json")
    session_meta_file = os.path.join(SESSIONS_DIR, user_id, "metadata", f"{session_id}.json")

    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            history = []
            if os.path.exists(history_file):
                with open(history_file, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            
            if len(history) < 2: 
                return jsonify({"error": "Not enough history"}), 400
            
            cleaned_history = []
            for msg in history[:4]: 
                if isinstance(msg.get('parts'), list) and len(msg['parts']) > 0:
                    cleaned_text = re.sub(r'^\[lang:([\w-]+)\]\s*', '', msg['parts'][0].get('text', ''))
                    
                    if not cleaned_text and len(msg['parts']) > 1:
                        continue
                        
                    role = msg.get('role', 'user')
                    if role not in ['user', 'model']:
                        role = 'user' 
                    cleaned_history.append({"role": role, "parts": [{"text": cleaned_text}]})
            
            if not cleaned_history:
                 return jsonify({"error": "No valid text history to use"}), 400

            system_prompt = (
                "You are a title generation expert. "
                "Based on the following chat history, generate a very short, concise title. "
                "Your response MUST be 5 words or less. "
                "Respond with ONLY the title and nothing else. "
                "DO NOT use quotes. DO NOT repeat the user's prompt. "
                "Example response: 'Planning a Trip to Kerala'"
            )
            
            # --- ### CHANGE 4: Use new model and payload structure from app (31).py ###
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={YOUR_API_KEY}"
            
            # We must strip any "model" roles that are not followed by a "user" role
            cleaned_history_for_title = []
            for i, msg in enumerate(cleaned_history):
                if msg.get('role') == 'model' and (i + 1 == len(cleaned_history) or cleaned_history[i+1].get('role') == 'model'):
                    continue
                cleaned_history_for_title.append(msg)

            payload = {
                "contents": cleaned_history_for_title, 
                "systemInstruction": {"parts": [{"text": system_prompt}]}
            }
            # --- ### END CHANGE ### ---
            
            req = urllib.request.Request(
                api_url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            with urllib.request.urlopen(req) as response:
                result = json.loads(response.read().decode('utf-8'))
                title = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'Chat')
                
                new_title = title.strip().replace('"', '').replace("'", "").replace("Title: ", "").replace("\n", " ")
                new_title_words = new_title.split()
                if len(new_title_words) > 7:
                    new_title = " ".join(new_title_words[:7]) + "..."

                meta_data = {}
                if os.path.exists(session_meta_file):
                    with open(session_meta_file, 'r', encoding='utf-8') as f:
                        meta_data = json.load(f)
                
                meta_data['title'] = new_title
                
                with open(session_meta_file, 'w', encoding='utf-8') as f:
                    json.dump(meta_data, f, indent=2)
            
                logger.info(f"Generated title for session {session_id}: {new_title}")
                return jsonify({"new_title": new_title})

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            logger.error(f"Error in /api/sessions/title (HTTPError): {e} - Body: {error_body}", exc_info=True)
            return jsonify({"error": "Title Gen API Error"}), 500
        except FileNotFoundError:
             logger.warning(f"History/Meta file not found for title gen: {user_id}/{session_id}")
             return jsonify({"error": "History not found"}), 404
        except (IOError, json.JSONDecodeError) as e:
            logger.error(f"Error generating title for {session_id} (File/JSON): {e}")
            return jsonify({"error": f"Could not generate title: {e}"}), 500
        except Exception as e:
            logger.error(f"Error generating title for {session_id}: {e}")
            return jsonify({"error": "Could not generate title"}), 500

@app.route("/api/session/rename", methods=["POST"])
def rename_session_title():
    data = request.get_json()
    user_id, session_id, new_title = data.get('user_id'), data.get('session_id'), data.get('new_title')

    if is_user_banned(user_id):
        return jsonify({"error": "Banned user"}), 403

    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    if not is_safe_uuid(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
    if not new_title or len(new_title.strip()) == 0:
        return jsonify({"error": "Invalid new title"}), 400
        
    session_meta_file = os.path.join(SESSIONS_DIR, user_id, "metadata", f"{session_id}.json")
    
    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            if not os.path.exists(session_meta_file):
                return jsonify({"error": "Session not found"}), 404

            with open(session_meta_file, 'r', encoding='utf-8') as f:
                meta_data = json.load(f)
            
            meta_data['title'] = new_title.strip()
            
            with open(session_meta_file, 'w', encoding='utf-8') as f:
                json.dump(meta_data, f, indent=2)
                
            logger.info(f"Renamed session {session_id} to '{new_title}' for {user_id}")
            return jsonify({"status": "success", "new_title": new_title.strip()})
            
        except (IOError, json.JSONDecodeError) as e:
            logger.error(f"Error renaming session {session_id} (File/JSON): {e}")
            return jsonify({"error": f"Could not rename session: {e}"}), 500
        except Exception as e:
            logger.error(f"Error renaming session {session_id}: {e}")
            return jsonify({"error": "Could not rename session"}), 500

@app.route("/api/session/delete/<user_id>/<session_id>", methods=["DELETE"])
def delete_session(user_id, session_id):
    
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    if not is_safe_uuid(session_id):
        return jsonify({"error": "Invalid session ID"}), 400
        
    session_meta_file = os.path.join(SESSIONS_DIR, user_id, "metadata", f"{session_id}.json")
    history_file = os.path.join(SESSIONS_DIR, user_id, "history", f"{session_id}.json")

    user_lock = get_user_lock(user_id)
    with user_lock:
        try:
            meta_deleted, history_deleted = False, False
            if os.path.exists(session_meta_file):
                os.remove(session_meta_file)
                meta_deleted = True
            else:
                 logger.warning(f"Meta file {session_meta_file} not found for deletion.")
                 
            if os.path.exists(history_file):
                os.remove(history_file)
                history_deleted = True
            else:
                 logger.warning(f"History file {history_file} not found for deletion.")
            
            if not meta_deleted and not history_deleted:
                return jsonify({"error": "Session not found"}), 404
                
            logger.info(f"Deleted session {session_id} for {user_id}")
            return jsonify({"status": "success"})
            
        except OSError as e:
            logger.error(f"Error deleting session {session_id} (OS Error): {e}")
            return jsonify({"error": f"Could not delete session files: {e}"}), 500
        except Exception as e:
            logger.error(f"Error deleting session {session_id}: {e}")
            return jsonify({"error": "Could not delete session"}), 500

@app.route("/api/themes", methods=['GET'])
def get_all_themes():
    try:
        themes = get_themes()
        theme_data = [{"id": t.get("id"), "name": t.get("name")} for t in themes]
        return jsonify(theme_data)
    except Exception as e:
        logger.error(f"Error getting theme list: {e}", exc_info=True)
        return jsonify({"error": "Could not load themes"}), 500

@app.route("/api/themes/all.css", methods=['GET'])
def get_all_themes_css():
    try:
        themes = get_themes()
        all_css = "\n\n".join([t.get("css", "") for t in themes])
        return Response(all_css, mimetype='text/css')
    except Exception as e:
        logger.error(f"Error generating all.css: {e}", exc_info=True)
        return "/* Error generating dynamic CSS */", 500

@app.route("/api/themes/add", methods=['POST'])
def add_theme():
    data = request.get_json()
    theme_name = data.get('name')
    theme_css = data.get('css')

    if not theme_name or not theme_name.strip():
        return jsonify({"error": "Theme name is required."}), 400
    if not theme_css or not theme_css.strip():
        return jsonify({"error": "Theme CSS code is required."}), 400
    
    theme_name = theme_name.strip()
    theme_css = theme_css.strip()
    
    theme_id = "theme-" + re.sub(r'[^a-z0-9]+', '-', theme_name.lower()).strip('-')
    
    themes = get_themes()
    
    if any(t.get("id") == theme_id for t in themes):
        return jsonify({"error": f"A theme with ID '{theme_id}' (derived from '{theme_name}') already exists."}), 400
    if any(t.get("name") == theme_name for t in themes):
        return jsonify({"error": f"A theme with the name '{theme_name}' already exists."}), 400

    if not theme_css.startswith("body." + theme_id):
        return jsonify({"error": f"CSS must start with 'body.{theme_id}' selector."}), 400
        
    new_theme = {
        "id": theme_id,
        "name": theme_name,
        "css": theme_css
    }
    
    themes.append(new_theme)
    
    if save_themes(themes):
        logger.info(f"Theme Manager: Added new theme '{theme_name}' (ID: {theme_id})")
        return jsonify({"status": "success", "new_theme": {"id": theme_id, "name": theme_name}})
    else:
        logger.error(f"Theme Manager: Failed to save new theme '{theme_name}'")
        return jsonify({"error": "Failed to save themes file."}), 500

@app.route("/api/themes/delete", methods=['POST'])
def delete_theme():
    data = request.get_json()
    theme_id = data.get('id')
    
    if not theme_id:
        return jsonify({"error": "Theme ID is required."}), 400
        
    DEFAULT_THEME_IDS_LIST = [
        "theme-light", "theme-dark", "theme-ocean", "theme-forest",
        "theme-sakura-light", "theme-sakura-dark", "theme-cyberpunk-light",
        "theme-cyberpunk-dark", "theme-nord-light", "theme-nord-dark",
        "theme-solarized-light", "theme-solarized-dark", "theme-gruvbox-light",
        "theme-gruvbox-dark", "theme-catppuccin-light", "theme-catppuccin-dark",
        "theme-rose-pine-light", "theme-rose-pine-dark"
    ]

    if theme_id in DEFAULT_THEME_IDS_LIST:
        logger.warning(f"Theme Manager: Attempt to delete default theme '{theme_id}' was blocked.")
        return jsonify({"error": "Cannot delete a default theme."}), 403
    
    themes = get_themes()
    
    new_themes = [t for t in themes if t.get("id") != theme_id]
    
    if len(themes) == len(new_themes):
        logger.warning(f"Theme Manager: Attempt to delete non-existent theme '{theme_id}'")
        return jsonify({"error": "Theme not found."}), 404
        
    if save_themes(new_themes):
        logger.info(f"Theme Manager: Deleted custom theme '{theme_id}'")
        return jsonify({"status": "success"})
    else:
        logger.error(f"Theme Manager: Failed to delete theme '{theme_id}'")
        return jsonify({"error": "Failed to save themes file."}), 500


@app.route("/api/manager/add-knowledge", methods=["POST"])
def add_knowledge():
    data = request.get_json()
    knowledge_text = data.get('knowledge')
    if not knowledge_text:
        return jsonify({"error": "No knowledge text provided"}), 400
    
    try:
        current_knowledge = get_ai_knowledge()
        new_lines = [line.strip() for line in knowledge_text.split('\n') if line.strip()]
        
        if not new_lines:
             return jsonify({"error": "No valid knowledge lines to add"}), 400
             
        updated_knowledge = current_knowledge + new_lines
        
        if save_ai_knowledge(updated_knowledge):
            logger.info(f"AI Manager: Added {len(new_lines)} new lines of KNOWLEDGE.")
            return jsonify({"status": "success", "lines_added": len(new_lines)})
        else:
            logger.error(f"AI Manager: Failed to save updated knowledge file.")
            return jsonify({"error": "Failed to save knowledge to file"}), 500
            
    except Exception as e:
        logger.error(f"AI Manager: Unexpected error adding knowledge: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred"}), 500

@app.route("/api/manager/add-instructions", methods=["POST"])
def add_instructions():
    data = request.get_json()
    instructions_text = data.get('instructions')
    if not instructions_text:
        return jsonify({"error": "No instructions text provided"}), 400
    
    try:
        current_instructions = get_ai_instructions()
        new_lines = [line.strip() for line in instructions_text.split('\n') if line.strip()]
        
        if not new_lines:
             return jsonify({"error": "No valid instruction lines to add"}), 400
             
        updated_instructions = current_instructions + new_lines
        
        if save_ai_instructions(updated_instructions):
            logger.info(f"AI Manager: Added {len(new_lines)} new lines of INSTRUCTIONS.")
            return jsonify({"status": "success", "lines_added": len(new_lines)})
        else:
            logger.error(f"AI Manager: Failed to save updated instructions file.")
            return jsonify({"error": "Failed to save instructions to file"}), 500
            
    except Exception as e:
        logger.error(f"AI Manager: Unexpected error adding instructions: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred"}), 500

@app.route("/api/manager/data-files", methods=['GET'])
def get_data_files():
    try:
        with data_sets_lock:
            file_pattern = os.path.join(DATA_SETS_DIR, "*.csv")
            csv_files = glob.glob(file_pattern)
        
        file_names = [os.path.basename(f) for f in csv_files]
        file_names.sort()
        
        return jsonify(file_names)
    except Exception as e:
        logger.error(f"Error getting data file list: {e}", exc_info=True)
        return jsonify({"error": "Could not load data files"}), 500

@app.route("/api/manager/upload-data", methods=['POST'])
def upload_data_file():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part in the request"}), 400
            
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
            
        if file and file.filename.endswith('.csv'):
            filename = secure_filename(file.filename)
            
            with data_sets_lock:
                save_path = os.path.join(DATA_SETS_DIR, filename)
                
                if os.path.exists(save_path):
                    return jsonify({"error": f"File '{filename}' already exists. Please delete it first if you want to re-upload."}), 409
                    
                file.save(save_path)
            
            logger.info(f"Data Manager: Successfully uploaded new data file '{filename}'")
            return jsonify({"status": "success", "filename": filename})
        else:
            return jsonify({"error": "Invalid file type. Only .csv files are allowed."}), 400
            
    except Exception as e:
        logger.error(f"Error uploading data file: {e}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred during upload"}), 500

@app.route("/api/manager/data-file/<filename>", methods=['DELETE'])
def delete_data_file(filename):
    try:
        safe_filename = secure_filename(filename)
        
        if safe_filename != filename or not filename.endswith('.csv'):
            logger.warning(f"Data Manager: Blocked unsafe delete attempt for '{filename}'")
            return jsonify({"error": "Invalid filename."}), 400
            
        with data_sets_lock:
            file_path = os.path.join(DATA_SETS_DIR, safe_filename)
            
            if not os.path.exists(file_path):
                logger.warning(f"Data Manager: Attempt to delete non-existent file '{safe_filename}'")
                return jsonify({"error": "File not found."}), 404
                
            os.remove(file_path)
        
        logger.info(f"Data Manager: Successfully deleted data file '{safe_filename}'")
        return jsonify({"status": "success", "filename": safe_filename})
        
    except Exception as e:
        logger.error(f"Error deleting data file '{filename}': {e}", exc_info=True)
        return jsonify({"error": "An unexpected server error occurred during deletion"}), 500

@app.route("/api/manager/users", methods=['GET'])
def get_all_users():
    try:
        banned_list = get_banned_users()
        user_list = []
        with users_auth_lock:
            users_data = load_users_auth()
            for email, data in users_data.items():
                user_id = data.get('user_id')
                if user_id:
                    first_name = data.get("first_name", "User").strip()
                    if not first_name:
                        first_name = "User"
                    
                    display_name = f"{first_name} - {email}"
                    
                    user_list.append({
                        "id": user_id,
                        "email": email,
                        "first_name": first_name,
                        "display_name": display_name,
                        "is_banned": user_id in banned_list
                    })
        
        user_list.sort(key=lambda x: (not x['is_banned'], x['email']))
        
        return jsonify(user_list)
    except OSError as e:
        logger.error(f"User Manager: Error listing users: {e}")
        return jsonify({"error": "Could not list users"}), 500

@app.route("/api/manager/user-details/<user_id>", methods=['GET'])
def get_user_details(user_id):
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    
    user_info = None
    with users_auth_lock:
        users_data = load_users_auth()
        for email, data in users_data.items():
            if data.get('user_id') == user_id:
                user_info = data
                break

    if not user_info:
        return jsonify({"error": "User file not found"}), 404
        
    try:
        session_meta_dir = os.path.join(SESSIONS_DIR, user_id, "metadata")
        session_count = 0
        if os.path.exists(session_meta_dir):
            session_count = len([f for f in os.listdir(session_meta_dir) if f.endswith('.json')])
            
        visits = user_info.get('visit_timestamps', [])
        if not isinstance(visits, list):
            visits = []
        
        details = {}
        details_json = user_info.get('device_details', '{}')
        try:
            details = json.loads(details_json)
        except json.JSONDecodeError:
            details = {"error": "Failed to parse device details."}

        return jsonify({
            "id": user_id,
            "email": user_info.get('email', 'Unknown'),
            "first_name": user_info.get('first_name', ''),
            "last_name": user_info.get('last_name', ''),
            "is_banned": is_user_banned(user_id),
            "session_count": session_count,
            "visit_history": visits,
            "device_details": details
        })
        
    except (IOError, OSError) as e:
        logger.error(f"User Manager: Error reading user details for {user_id}: {e}")
        return jsonify({"error": "Could not read user file"}), 500

@app.route("/api/manager/user-personality/<user_id>", methods=['POST'])
def get_user_personality(user_id):
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
        
    logger.info(f"User Manager: Generating personality analysis for {user_id}...")
    
    all_chats = get_all_user_chats(user_id)
    
    analysis_data = get_user_personality_analysis(user_id, all_chats)
    
    logger.info(f"User Manager: Successfully generated analysis for {user_id}.")
    
    return jsonify({
        "analysis_data": analysis_data
    })

@app.route("/api/manager/user-ban", methods=['POST'])
def http_ban_user():
    data = request.get_json()
    user_id = data.get('user_id')
    
    success, message = ban_user(user_id)
    
    if success:
        return jsonify({"status": "success", "message": message})
    else:
        return jsonify({"error": message}), 500

@app.route("/api/manager/user-unban", methods=['POST'])
def http_unban_user():
    data = request.get_json()
    user_id = data.get('user_id')
    
    success, message = unban_user(user_id)
    
    if success:
        return jsonify({"status": "success", "message": message})
    else:
        return jsonify({"error": message}), 500

@app.route("/api/manager/user-data/<user_id>", methods=['DELETE'])
def http_delete_user_data(user_id):
    if not is_safe_user_id(user_id):
        return jsonify({"error": "Invalid user ID"}), 400
    
    logger.warning(f"User Manager: Received request to DELETE ALL DATA for user '{user_id}'")
    
    deleted_user_auth = False
    deleted_sessions = False
    
    try:
        with users_auth_lock:
            users_data = load_users_auth()
            user_email = None
            for email, data in users_data.items():
                if data.get('user_id') == user_id:
                    user_email = email
                    break
            
            if user_email:
                del users_data[user_email]
                save_users_auth(users_data)
                deleted_user_auth = True
        
        user_sessions_dir = os.path.join(SESSIONS_DIR, user_id)
        if os.path.exists(user_sessions_dir):
            shutil.rmtree(user_sessions_dir)
            deleted_sessions = True
            
        unban_user(user_id)
        
        if not deleted_user_auth and not deleted_sessions:
            return jsonify({"error": "No data found for this user."}), 404
            
        logger.info(f"User Manager: Successfully deleted all data for user '{user_id}'")
        return jsonify({"status": "success", "message": "User data deleted."})

    except (OSError, IOError) as e:
        logger.error(f"User Manager: Failed to delete data for '{user_id}': {e}")
        return jsonify({"error": "Failed to delete user data."}), 500


@app.route("/manager")
def manager_page():
    try:
        return render_template("manager.html")
    except Exception as e:
        logger.error(f"Could not render manager.html: {e}")
        return "Error: manager.html template not found.", 404

# ### START AUTH ROUTES ###
# These are the *only* auth routes that will be used,
# as they appear last in the file.

@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        first_name = (data.get("first_name") or "").strip()
        last_name = (data.get("last_name") or "").strip()
        
        if not email or "@" not in email:
            return jsonify({"error": "Invalid email"}), 400
        if len(password) < 8:
            return jsonify({"error": "Password must be 8+ characters"}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            if email in users and users[email].get("email_verified"):
                return jsonify({"error": "Email already registered"}), 400
            
            otp = generate_otp()
            store_otp(email, 'register', otp)
            
            if not send_otp_email(email, otp, "verification"):
                return jsonify({"error": "Failed to send OTP email"}), 500
            
            if email not in users:
                users[email] = {}
            
            users[email].update({
                "user_id": users[email].get('user_id', email_to_user_id(email)),
                "email": email,
                "first_name": first_name or "User",
                "last_name": last_name,
                "password_hash": hash_password(password),
                "email_verified": False,
                "created_at": users[email].get('created_at', datetime.now().isoformat())
            })
            
            save_users_auth(users)
        
        logger.info(f"Registration initiated: {email}")
        return jsonify({"ok": True, "message": "OTP sent to your email"}), 200
        
    except Exception as e:
        logger.error(f"Registration error: {e}", exc_info=True)
        return jsonify({"error": "Registration failed"}), 500

@app.route('/api/register/verify', methods=['POST'])
def api_register_verify():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        otp = (data.get("otp") or "").strip()
        
        if not email or not otp:
            return jsonify({"error": "Email and OTP required"}), 400
        
        success, message = verify_otp(email, 'register', otp)
        if not success:
            return jsonify({"error": message}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            if email not in users:
                return jsonify({"error": "User not found"}), 404
            
            users[email]["email_verified"] = True
            user_id = users[email]["user_id"]
            first_name = users[email].get("first_name", "User")
            save_users_auth(users)
        
        ensure_user_session_dirs(user_id)
        
        logger.info(f"Email verified: {email}")
        return jsonify({"ok": True, "message": "Email verified successfully!", "user_id": user_id, "first_name": first_name}), 200
        
    except Exception as e:
        logger.error(f"Verification error: {e}", exc_info=True)
        return jsonify({"error": "Verification failed"}), 500

@app.route('/api/register/resend', methods=['POST'])
def api_register_resend():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        
        if not email:
            return jsonify({"error": "Email required"}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            if email not in users:
                return jsonify({"error": "User not found"}), 404
        
        otp = generate_otp()
        store_otp(email, 'register', otp)
        
        if not send_otp_email(email, otp, "verification"):
            return jsonify({"error": "Failed to send email"}), 500
        
        return jsonify({"ok": True, "message": "New code sent to your email"}), 200
        
    except Exception as e:
        logger.error(f"Resend error: {e}", exc_info=True)
        return jsonify({"error": "Resend failed"}), 500

@app.route('/api/login', methods=['POST'])
def api_login():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        
        if not email or not password:
            return jsonify({"error": "Email and password required"}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            user = users.get(email)
        
        if not user or not (user.get("password_hash") == hash_password(password)):
            return jsonify({"error": "Invalid email or password"}), 401
        
        if not user.get("email_verified"):
            logger.warning(f"Login attempt from unverified email: {email}")
            return jsonify({"error": "Email not verified. Please check your email for an OTP or resend it."}), 403
            
        user_id = user.get("user_id")
        if not user_id:
            logger.error(f"CRITICAL: User {email} has no user_id.")
            return jsonify({"error": "User data corrupted, please contact support."}), 500

        if is_user_banned(user_id):
            logger.warning(f"Banned user login attempt: {email} ({user_id})")
            return jsonify({"error": "This account has been banned.", "banned": True}), 403
        
        first_name = user.get("first_name", "User")
        
        logger.info(f"Login successful: {email}")
        return jsonify({"ok": True, "message": "Login successful", "user_id": user_id, "first_name": first_name}), 200
        
    except Exception as e:
        logger.error(f"Login error: {e}", exc_info=True)
        return jsonify({"error": "Login failed"}), 500

@app.route('/api/forgot', methods=['POST'])
def api_forgot():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        
        if not email:
            return jsonify({"error": "Email required"}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            if email not in users:
                logger.warning(f"Forgot password attempt for non-existent user: {email}")
                return jsonify({"ok": True, "message": "If an account exists, a reset code has been sent."}), 200
        
        otp = generate_otp()
        store_otp(email, 'reset', otp)
        
        if not send_otp_email(email, otp, "reset"):
            return jsonify({"error": "Failed to send email"}), 500
        
        return jsonify({"ok": True, "message": "Reset code sent to your email"}), 200
        
    except Exception as e:
        logger.error(f"Forgot password error: {e}", exc_info=True)
        return jsonify({"error": "Request failed"}), 500

@app.route('/api/forgot/verify', methods=['POST'])
def api_forgot_verify():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        otp = (data.get("otp") or "").strip()
        
        if not email or not otp:
            return jsonify({"error": "Email and OTP required"}), 400
        
        success, message = verify_otp(email, 'reset', otp)
        if not success:
            return jsonify({"error": message}), 400
        
        store_otp(email, 'reset_verified', otp) 
        
        return jsonify({"ok": True, "message": "OTP verified"}), 200
        
    except Exception as e:
        logger.error(f"OTP verification error: {e}", exc_info=True)
        return jsonify({"error": "Verification failed"}), 500

@app.route('/api/forgot/reset', methods=['POST'])
def api_forgot_reset():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        otp = (data.get("otp") or "").strip()
        new_password = data.get("new_password") or ""
        
        if not all([email, otp, new_password]):
            return jsonify({"error": "Email, OTP and new password required"}), 400
        
        if len(new_password) < 8:
             return jsonify({"error": "Password must be 8+ characters"}), 400
        
        success, message = verify_otp(email, 'reset_verified', otp)
        if not success:
            return jsonify({"error": "OTP not verified or expired. Please start over."}), 400
        
        with users_auth_lock:
            users = load_users_auth()
            if email not in users:
                return jsonify({"error": "User not found"}), 404
            
            users[email]["password_hash"] = hash_password(new_password)
            save_users_auth(users)
        
        logger.info(f"Password reset: {email}")
        return jsonify({"ok": True, "message": "Password reset successful"}), 200
        
    except Exception as e:
        logger.error(f"Reset error: {e}", exc_info=True)
        return jsonify({"error": "Reset failed"}), 500

# ### END AUTH ROUTES ###


if __name__ == "__main__":
    get_themes() 
    
    logger.info("----------------------------------")
    logger.info(f"Kasi AI Pro Chat (v35 - Fixed) Starting...")
    logger.info("--- Using JSON FILE STORAGE (users_auth.json) ---")
    logger.info("--- Using DYNAMIC THEME DATABASE (themes.json) ---")
    logger.info("--- 🚀 NEW: CUSTOM CSV DATASETS ENABLED (data_sets/) ---")
    logger.info(f"--- 🚀 IMAGE GEN: GOOGLE API ({'gemini-2.5-flash-image-preview'}) ---") 
    logger.info(f"--- 🚀 IMAGE ANALYSIS: GOOGLE API ({'gemini-2.5-flash-preview-09-2025'}) ---")
    logger.info(f"--- 🚀 TTS: GOOGLE API ({'gemini-2.5-flash-preview-tts'}) ---")
    logger.info("----------------------------------")
    try:
        app.run(host="0.0.0.0", port=8080, use_reloader=False, threaded=True, debug=False)
    except Exception as e:
        logger.critical(f"App failed to start: {e}", exc_info=True)
    finally:
        logger.info("----------------------------------")
        logger.info("Kasi AI Pro Chat Shutting Down.")
        logger.info("----------------------------------")

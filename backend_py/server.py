# backend_py/server.py

# Import necessary modules from "flask" and "ollama"
from flask import Flask, request, jsonify
from ollama import chat

# Create a Flask application instance
app = Flask(__name__)


# REQUIRES: Imports are resolved, At least 3.5 GB of memory(RAM or wtv).
# MODIFIES: Nothing
# EFFECTS : Uses the ollama "chat" function from the ollama libary to create a sort summary of a keyword(NOTE: this is all local). 
def model_call(keyword: str,model: str):
    # Intial prompting 
    messages = [{"role": "system","content": "You are a concise summarization assistant."},
                {"role": "user","content": f"Summarize the topic: {keyword}. Use less then 50 words and explain in clear terms using examples when necessary"},]
    if model == "default":
        response = chat(model='llama3.2', messages=messages) # call to the model passing the context.(default is llama3.2, NOTE it always will be for now)
    # return the content of the response (string)
    return response["message"]["content"]


# REQUIRES: Imports are resolved
# MODIFIES: json data
# EFFECTS : Calls the "model_call()" function with parameters provided from the .....
@app.route("/generate_summary", methods=["GET"])
def generate_summary():
    # Get parameters from the request URL (e.g., /generate_summary?keyword=cat&model=default)
    keyword = request.args.get("keyword", "default")  # default to "default" if not provided
    model = request.args.get("model", "default")  # default to "default" model if not provided
    #  Genrate a summary from calling the ollama model
    try:
        summary_text = model_call(keyword, model) #call to ollama
    except Exception as e:
        return jsonify({"error": "Model invocation failed."}), 500 # return a summary that shows error with code 500.
    # Return the summary in JSON format so the frontend (Obsidian) can read it easily
    return jsonify({"summary": summary_text})


# If this file is run directly, start the Flask local server
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000) #run locally

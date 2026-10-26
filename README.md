# StAg Survey

A three-part labeling survey for messages people sent to AI chatbots.

- **Part 1 (20 messages):** Does the message show structural agency, the user's "ability to navigate and shape complex systems and institutions"?
- **Part 2 (36 messages):** Every message shows structural agency. Does the user's real-world situation fall under the domain shown?
- **Part 3 (24 messages):** Every message shows structural agency. Does the user ask the AI to do the action shown?

## For annotators

Open the survey link you were given and enter your annotator code (A1–A6). Your answers are saved in your browser as you go. At the end, press **Download my answers** and email the file to the study coordinator.

## Privacy

The site has no server and collects nothing on its own. Answers stay in the annotator's browser until they download the file and choose to send it. No names, emails, or other personal information are requested.

The messages are user turns from [WildChat](https://huggingface.co/datasets/allenai/WildChat-4.8M) (ODC-BY). They were screened by hand to remove personal or identifying details.

## Development

```sh
python3 -m http.server 8000   # then open http://localhost:8000
node --test tests/            # data and logic checks
```

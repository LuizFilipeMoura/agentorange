import React from 'react';

function MessageBubble({ message }) {
  if (!message) {
    return null;
  }

  return (
    <div className="message-bubble">
      {message.split('\n').map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </div>
  );
}

export default MessageBubble;

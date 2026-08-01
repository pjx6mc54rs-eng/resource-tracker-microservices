const SendIcon = ({ size = "20px", handleClick }) => {
  return (
    <svg
      width={size}
      height={size}
      onClick={handleClick}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line
        x1="21"
        y1="3"
        x2="11"
        y2="13"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        points="21 3 14.5 21 11 13 3 9.5 21 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default SendIcon;

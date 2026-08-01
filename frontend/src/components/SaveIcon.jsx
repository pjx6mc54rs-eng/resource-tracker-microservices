const SaveIcon = ({ size = "20px", handleClick }) => {
  return (
    <svg
      width={size}
      height={size}
      onClick={handleClick}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4.5 3.75h11.379a1.5 1.5 0 011.06.44l2.371 2.37a1.5 1.5 0 01.44 1.061V18.75A2.25 2.25 0 0117.5 21h-13a2.25 2.25 0 01-2.25-2.25V6A2.25 2.25 0 014.5 3.75z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.25 3.75v4.5h6v-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 21v-6.75h9V21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default SaveIcon;

const SunIcon = ({ size = "20px", handleClick }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      onClick={handleClick} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      style={{ cursor: 'pointer' }}
    >
      <path 
        d="M12 18a6 6 0 100-12 6 6 0 000 12zM22 12h-1M3 12H2M12 2v1m0 18v-1m7.071-14.071l-.707.707M4.929 19.071l-.707.707m14.142 0l-.707-.707M4.929 4.929l-.707-.707" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default SunIcon;
